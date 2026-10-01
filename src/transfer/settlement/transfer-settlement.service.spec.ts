jest.mock('@/ledger/account.service', () => ({ AccountService: class {} }));
jest.mock('@/ledger/ledger.service', () => ({ LedgerService: class {} }));
jest.mock('@database/repository/ledger.repository', () => ({
  LedgerRepository: class {},
}));
jest.mock('@/audit/audit.service', () => ({ AuditService: class {} }));
jest.mock('@/database/database.service', () => ({ DatabaseService: class {} }));
jest.mock('@database/repository/transfer.repository', () => ({
  TransferRepository: class {},
}));
jest.mock('@/utils/id', () => ({ newId: () => 'test-id' }));

import { ConflictException } from '@nestjs/common';
import { PermanentError } from '@/kafka/retry-with-jitter';
import { PaymentStatus, SystemAccountCode } from '@/utils/database.enums';
import { TRANSFER_RECONCILIATION_REASON } from '@/transfer/provider-events/transfer-money.guards';
import {
  TransferSettlementResult,
  TransferSettlementService,
} from '@/transfer/settlement/transfer-settlement.service';

describe('TransferSettlementService', () => {
  const paymentId = 'pay-1';
  const reference = 'TRF-1';
  const transaction = {
    id: 'txn-1',
    paymentId,
    amount: 5000n,
    currency: 'NGN',
  };

  const suspense = { id: 'acc-suspense' };
  const float = { id: 'acc-float' };

  let transferRepository: {
    findByReference: jest.Mock;
    findPaymentByIdForUpdate: jest.Mock;
    findPaymentById: jest.Mock;
    markProviderAccepted: jest.Mock;
    updatePaymentSettlement: jest.Mock;
    updateTransactionStatus: jest.Mock;
  };
  let accountService: { findByCode: jest.Mock };
  let ledgerService: { createTransaction: jest.Mock };
  let ledgerRepository: { findTransactionByReference: jest.Mock };
  let auditService: { log: jest.Mock };
  let db: { transaction: jest.Mock };
  let service: TransferSettlementService;

  function lockedPayment(overrides: Record<string, unknown> = {}) {
    return {
      id: paymentId,
      amount: 5000n,
      currency: 'NGN',
      status: PaymentStatus.PENDING,
      settlementLedgerTransactionId: null,
      reversalLedgerTransactionId: null,
      externalReference: 'ext-1',
      ...overrides,
    };
  }

  beforeEach(() => {
    transferRepository = {
      findByReference: jest.fn().mockResolvedValue(transaction),
      findPaymentByIdForUpdate: jest.fn(),
      findPaymentById: jest.fn(),
      markProviderAccepted: jest.fn(),
      updatePaymentSettlement: jest.fn().mockResolvedValue(true),
      updateTransactionStatus: jest.fn(),
    };
    accountService = {
      findByCode: jest.fn(async (code: string) => {
        if (code === SystemAccountCode.OUTBOUND_TRANSFERS_PENDING_SETTLEMENT) {
          return suspense;
        }
        if (code === SystemAccountCode.PROVIDER_PAYOUT_FLOAT) {
          return float;
        }
        return undefined;
      }),
    };
    ledgerService = {
      createTransaction: jest.fn().mockResolvedValue({
        transaction: { id: 'ledger-settle-1' },
      }),
    };
    ledgerRepository = {
      findTransactionByReference: jest.fn(),
    };
    auditService = { log: jest.fn() };
    db = {
      transaction: jest.fn().mockReturnValue({
        execute: (fn: (trx: unknown) => Promise<unknown>) => fn({}),
      }),
    };

    service = new TransferSettlementService(
      db as never,
      accountService as never,
      ledgerService as never,
      ledgerRepository as never,
      transferRepository as never,
      auditService as never,
    );
  });

  it('posts settlement using locked payment amount/currency, not caller input', async () => {
    transferRepository.findPaymentByIdForUpdate.mockResolvedValue(
      lockedPayment({ amount: 7777n, currency: 'NGN' }),
    );

    const result = await service.settle({ paymentId, reference });

    expect(result).toBe(TransferSettlementResult.APPLIED);
    expect(ledgerService.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: `${reference}-settle`,
        entries: [
          expect.objectContaining({ amount: 7777n }),
          expect.objectContaining({ amount: 7777n }),
        ],
      }),
      expect.anything(),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: {
          after: expect.objectContaining({
            amount: '7777',
            currency: 'NGN',
          }),
        },
      }),
      expect.anything(),
    );
  });

  it('returns ALREADY_APPLIED when settlement ledger id is already set (race winner)', async () => {
    transferRepository.findPaymentByIdForUpdate.mockResolvedValue(
      lockedPayment({ settlementLedgerTransactionId: 'existing-settle' }),
    );

    const result = await service.settle({ paymentId, reference });

    expect(result).toBe(TransferSettlementResult.ALREADY_APPLIED);
    expect(ledgerService.createTransaction).not.toHaveBeenCalled();
  });

  it('returns ALREADY_APPLIED when concurrent settle loses the settlement predicate', async () => {
    transferRepository.findPaymentByIdForUpdate.mockResolvedValue(
      lockedPayment(),
    );
    transferRepository.updatePaymentSettlement.mockResolvedValue(false);
    transferRepository.findPaymentById.mockResolvedValue(
      lockedPayment({ settlementLedgerTransactionId: 'winner-settle' }),
    );

    const result = await service.settle({ paymentId, reference });

    expect(result).toBe(TransferSettlementResult.ALREADY_APPLIED);
  });

  it('rejects success after terminal reversal state', async () => {
    transferRepository.findPaymentByIdForUpdate.mockResolvedValue(
      lockedPayment({
        status: PaymentStatus.FAILED,
        reversalLedgerTransactionId: 'rev-1',
      }),
    );

    await expect(service.settle({ paymentId, reference })).rejects.toThrow(
      PermanentError,
    );
    await expect(service.settle({ paymentId, reference })).rejects.toThrow(
      TRANSFER_RECONCILIATION_REASON.SUCCESS_AFTER_TERMINAL_STATE,
    );
  });

  it('resolves duplicate ledger reference to existing settle posting', async () => {
    transferRepository.findPaymentByIdForUpdate.mockResolvedValue(
      lockedPayment(),
    );
    ledgerService.createTransaction.mockRejectedValue(new ConflictException());
    ledgerRepository.findTransactionByReference.mockResolvedValue({
      id: 'existing-ledger',
    });

    const result = await service.settle({ paymentId, reference });

    expect(result).toBe(TransferSettlementResult.APPLIED);
    expect(transferRepository.updatePaymentSettlement).toHaveBeenCalledWith(
      paymentId,
      'existing-ledger',
      expect.anything(),
    );
  });
});
