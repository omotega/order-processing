jest.mock('@/database/database.service', () => ({
  DatabaseService: class {},
}));
jest.mock('@database/repository/account.repository', () => ({
  AccountRepository: class {},
}));
jest.mock('@/ledger/ledger.service', () => ({ LedgerService: class {} }));
jest.mock('@database/repository/transfer.repository', () => ({
  TransferRepository: class {},
}));
jest.mock('@/limits/limits.service', () => ({ LimitsService: class {} }));
jest.mock('@/audit/audit.service', () => ({ AuditService: class {} }));

import { PaymentStatus } from '@/utils/database.enums';
import { TransferJobType } from '@/transfer/dto/transfer-job.schema';
import { TransferReverseService } from '@/transfer/reversal/transfer-reverse.service';

describe('TransferReverseService race with settlement', () => {
  let transferRepository: {
    findPaymentById: jest.Mock;
    findPaymentByIdForUpdate: jest.Mock;
  };
  let ledgerService: { createTransaction: jest.Mock };
  let service: TransferReverseService;

  beforeEach(() => {
    transferRepository = {
      findPaymentById: jest.fn(),
      findPaymentByIdForUpdate: jest.fn(),
    };
    ledgerService = { createTransaction: jest.fn() };
    const db = {
      transaction: jest.fn().mockReturnValue({
        execute: (fn: (trx: unknown) => Promise<unknown>) => fn({}),
      }),
    };
    service = new TransferReverseService(
      db as never,
      {
        findByUserIdForUpdate: jest.fn(),
        findByCodeForUpdate: jest.fn(),
      } as never,
      ledgerService as never,
      transferRepository as never,
      { releaseDailySpend: jest.fn() } as never,
      { log: jest.fn() } as never,
    );
  });

  it('does not apply reverse ledger when payment left REVERSAL_PENDING (settlement won)', async () => {
    transferRepository.findPaymentById.mockResolvedValue({
      id: 'pay-1',
      status: PaymentStatus.COMPLETED,
      settlementLedgerTransactionId: 'settle-1',
    });

    await service.processReverseJob({
      type: TransferJobType.REVERSE,
      paymentId: 'pay-1',
      transactionId: 'txn-1',
      reference: 'TRF-1',
      userId: 'user-1',
      amount: '1000',
      currency: 'NGN',
      reason: 'late reverse',
    });

    expect(ledgerService.createTransaction).not.toHaveBeenCalled();
    expect(transferRepository.findPaymentByIdForUpdate).not.toHaveBeenCalled();
  });
});
