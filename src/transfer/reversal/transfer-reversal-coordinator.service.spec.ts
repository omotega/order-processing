jest.mock('@/database/database.service', () => ({ DatabaseService: class {} }));
jest.mock('@database/repository/transfer.repository', () => ({
  TransferRepository: class {},
}));

import { PermanentError } from '@/kafka/retry-with-jitter';
import { PaymentProcessingStatus, PaymentStatus } from '@/utils/database.enums';
import { TransferJobType } from '@/transfer/dto/transfer-job.schema';
import { TRANSFER_RECONCILIATION_REASON } from '@/transfer/provider-events/transfer-money.guards';
import { TRANSFER_REVERSAL_ALLOWED_STATUSES } from '@/transfer/reversal/transfer-reversal.constants';
import {
  TransferReversalCoordinator,
  TransferReversalRequestStatus,
} from '@/transfer/reversal/transfer-reversal-coordinator.service';

describe('TransferReversalCoordinator', () => {
  const paymentId = 'pay-1';
  const transactionId = 'txn-1';
  const reference = 'TRF-1';
  const userId = 'user-1';

  let transferRepository: {
    findPaymentByIdForUpdate: jest.Mock;
    findTransactionById: jest.Mock;
    requestReversal: jest.Mock;
  };
  let db: { transaction: jest.Mock };
  let coordinator: TransferReversalCoordinator;

  function payment(overrides: Record<string, unknown> = {}) {
    return {
      id: paymentId,
      userId,
      paymentReference: reference,
      amount: 2500n,
      currency: 'NGN',
      status: PaymentStatus.PENDING,
      processingStatus: PaymentProcessingStatus.AWAITING_SETTLEMENT,
      settlementLedgerTransactionId: null,
      reversalLedgerTransactionId: null,
      ...overrides,
    };
  }

  function transaction(overrides: Record<string, unknown> = {}) {
    return {
      id: transactionId,
      paymentId,
      userId,
      reference,
      amount: 2500n,
      currency: 'NGN',
      ledgerTransactionId: 'hold-1',
      ...overrides,
    };
  }

  beforeEach(() => {
    transferRepository = {
      findPaymentByIdForUpdate: jest.fn().mockResolvedValue(payment()),
      findTransactionById: jest.fn().mockResolvedValue(transaction()),
      requestReversal: jest.fn().mockResolvedValue(payment()),
    };
    db = {
      transaction: jest.fn().mockReturnValue({
        execute: (fn: (trx: unknown) => Promise<unknown>) => fn({}),
      }),
    };
    coordinator = new TransferReversalCoordinator(
      db as never,
      transferRepository as never,
    );
  });

  it('starts reversal and builds a typed reverse job from locked rows', async () => {
    const result = await coordinator.request({
      paymentId,
      transactionId,
      reason: 'provider rejected',
      fromStatuses: TRANSFER_REVERSAL_ALLOWED_STATUSES.VERIFY_REJECTED,
    });

    expect(result.status).toBe(TransferReversalRequestStatus.STARTED);
    if (result.status !== TransferReversalRequestStatus.STARTED) {
      throw new Error('expected STARTED');
    }
    expect(result.job).toEqual({
      type: TransferJobType.REVERSE,
      paymentId,
      transactionId,
      reference,
      userId,
      amount: '2500',
      currency: 'NGN',
      reason: 'provider rejected',
      ledgerTransactionId: 'hold-1',
      correlationId: undefined,
    });
    expect(transferRepository.requestReversal).toHaveBeenCalledWith(
      paymentId,
      'provider rejected',
      [...TRANSFER_REVERSAL_ALLOWED_STATUSES.VERIFY_REJECTED],
      expect.anything(),
    );
  });

  it('returns ALREADY_REVERSED when failed with reversal ledger posted', async () => {
    transferRepository.findPaymentByIdForUpdate.mockResolvedValue(
      payment({
        status: PaymentStatus.FAILED,
        reversalLedgerTransactionId: 'rev-ledger',
      }),
    );

    const result = await coordinator.request({
      paymentId,
      transactionId,
      reason: 'dup',
      fromStatuses: TRANSFER_REVERSAL_ALLOWED_STATUSES.WEBHOOK_REJECTED,
    });

    expect(result).toEqual({
      status: TransferReversalRequestStatus.ALREADY_REVERSED,
    });
    expect(transferRepository.requestReversal).not.toHaveBeenCalled();
  });

  it('returns ALREADY_PENDING with job when already REVERSAL_PENDING', async () => {
    transferRepository.findPaymentByIdForUpdate.mockResolvedValue(
      payment({ status: PaymentStatus.REVERSAL_PENDING }),
    );

    const result = await coordinator.request({
      paymentId,
      transactionId,
      reason: 'retry',
      fromStatuses: TRANSFER_REVERSAL_ALLOWED_STATUSES.VERIFY_REJECTED,
    });

    expect(result.status).toBe(TransferReversalRequestStatus.ALREADY_PENDING);
    if (result.status !== TransferReversalRequestStatus.ALREADY_PENDING) {
      throw new Error('expected ALREADY_PENDING');
    }
    expect(result.job.type).toBe(TransferJobType.REVERSE);
    expect(transferRepository.requestReversal).not.toHaveBeenCalled();
  });

  it('returns NOT_TRANSITIONED when settlement won the race (predicate lost)', async () => {
    transferRepository.requestReversal.mockResolvedValue(undefined);

    const result = await coordinator.request({
      paymentId,
      transactionId,
      reason: 'too late',
      fromStatuses: TRANSFER_REVERSAL_ALLOWED_STATUSES.VERIFY_REJECTED,
    });

    expect(result).toEqual({
      status: TransferReversalRequestStatus.NOT_TRANSITIONED,
    });
  });

  it('rejects payment/transaction identity mismatch', async () => {
    transferRepository.findTransactionById.mockResolvedValue(
      transaction({ paymentId: 'other-pay' }),
    );

    await expect(
      coordinator.request({
        paymentId,
        transactionId,
        reason: 'bad',
        fromStatuses: TRANSFER_REVERSAL_ALLOWED_STATUSES.SUBMIT_REJECTED,
      }),
    ).rejects.toBeInstanceOf(PermanentError);

    await expect(
      coordinator.request({
        paymentId,
        transactionId,
        reason: 'bad',
        fromStatuses: TRANSFER_REVERSAL_ALLOWED_STATUSES.SUBMIT_REJECTED,
      }),
    ).rejects.toThrow(
      TRANSFER_RECONCILIATION_REASON.PAYMENT_TRANSACTION_MISMATCH,
    );
  });
});
