import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { IdempotencyKeyState, PaymentStatus } from '@/utils/database.enums';
import { COMMON_ERRORS } from '@/common/errors/index';
import { hashTransferPayload } from '@/transfer/acceptance/transfer-payload-hash';
import { TRANSFER_ACCEPT_OPERATION } from '@database/repository/idempotency.repository';

jest.mock('@/utils/id', () => ({
  newId: () => 'test-id',
}));
jest.mock('@/config/config', () => ({
  appConfig: { paymentProviderClaimLeaseSeconds: 30 },
}));
jest.mock('@/ledger/account.service', () => ({ AccountService: class {} }));
jest.mock('@database/repository/account.repository', () => ({
  AccountRepository: class {},
}));
jest.mock('@/ledger/ledger.service', () => ({ LedgerService: class {} }));
jest.mock('@database/repository/transfer.repository', () => ({
  TransferRepository: class {},
}));
jest.mock('@/limits/limits.service', () => ({ LimitsService: class {} }));
jest.mock('@database/repository/outbox.repository', () => ({
  OutboxRepository: class {},
}));
jest.mock('@/payment-providers/payment-provider.factory', () => ({
  PaymentProviderFactory: class {},
}));
jest.mock('@/database/database.service', () => ({
  DatabaseService: class {},
}));
jest.mock('@database/repository/idempotency.repository', () => {
  const actual = jest.requireActual(
    '@database/repository/idempotency.repository',
  );
  return {
    ...actual,
    IdempotencyRepository: class {},
  };
});

import { TransferAcceptService } from '@/transfer/acceptance/transfer-accept.service';

describe('TransferAcceptService', () => {
  const userId = 'user-1';
  const payload = {
    amount: 1000,
    bankCode: '058',
    accountNumber: '0123456789',
    idempotencyKey: 'idem-1',
    description: 'test',
  };

  const requestHash = hashTransferPayload({
    userId,
    amount: payload.amount,
    currency: 'NGN',
    bankCode: payload.bankCode,
    accountNumber: payload.accountNumber,
  });

  const acceptedResponse = {
    status: 'ACCEPTED' as const,
    correlationId: 'corr-1',
    reference: 'TRF-1',
    paymentId: 'pay-1',
    transactionId: 'txn-1',
    paymentStatus: PaymentStatus.PENDING,
    transactionStatus: 'PENDING',
    provider: 'PAYSTACK',
  };

  let idempotencyRepository: {
    find: jest.Mock;
    tryBegin: jest.Mock;
    findForUpdate: jest.Mock;
    resetForReuse: jest.Mock;
    complete: jest.Mock;
  };
  let accountService: { findByUserId: jest.Mock };
  let paymentProviderFactory: { resolveActiveProvider: jest.Mock };
  let service: TransferAcceptService;

  beforeEach(() => {
    idempotencyRepository = {
      find: jest.fn(),
      tryBegin: jest.fn(),
      findForUpdate: jest.fn(),
      resetForReuse: jest.fn(),
      complete: jest.fn(),
    };
    accountService = {
      findByUserId: jest.fn(),
    };
    paymentProviderFactory = {
      resolveActiveProvider: jest.fn().mockResolvedValue('PAYSTACK'),
    };

    service = new TransferAcceptService(
      accountService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      paymentProviderFactory as never,
      idempotencyRepository as never,
      {} as never,
      {} as never,
    );
  });

  it('replays when key is COMPLETE within TTL and requestHash matches', async () => {
    idempotencyRepository.find.mockResolvedValue({
      userId,
      operationType: TRANSFER_ACCEPT_OPERATION,
      key: 'test-id',
      requestHash,
      state: IdempotencyKeyState.COMPLETE,
      response: acceptedResponse,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await service.accept(payload as never, { id: userId });

    expect(idempotencyRepository.find).toHaveBeenCalledWith({
      scopeType: 'USER',
      scopeId: userId,
      operationType: TRANSFER_ACCEPT_OPERATION,
      key: 'test-id',
    });
    expect(result).toMatchObject({
      status: 'ACCEPTED',
      reference: 'TRF-1',
      paymentId: 'pay-1',
      transactionId: 'txn-1',
    });
    expect(accountService.findByUserId).not.toHaveBeenCalled();
  });

  it('rejects when live key is reused with a different requestHash', async () => {
    idempotencyRepository.find.mockResolvedValue({
      userId,
      operationType: TRANSFER_ACCEPT_OPERATION,
      key: 'test-id',
      requestHash: 'different-hash',
      state: IdempotencyKeyState.COMPLETE,
      response: acceptedResponse,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.accept(payload as never, { id: userId }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when acceptance is already in progress for the key', async () => {
    idempotencyRepository.find.mockResolvedValue({
      userId,
      operationType: TRANSFER_ACCEPT_OPERATION,
      key: 'test-id',
      requestHash,
      state: IdempotencyKeyState.IN_PROGRESS,
      response: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.accept(payload as never, { id: userId }),
    ).rejects.toThrow(/already in progress/i);
  });

  it('treats past-due keys as reusable and continues toward new accept', async () => {
    idempotencyRepository.find.mockResolvedValue({
      userId,
      operationType: TRANSFER_ACCEPT_OPERATION,
      key: 'test-id',
      requestHash,
      state: IdempotencyKeyState.COMPLETE,
      response: acceptedResponse,
      expiresAt: new Date(Date.now() - 60_000),
    });
    accountService.findByUserId.mockResolvedValue({
      id: 'acc-1',
      balance: 100n,
    });

    // After TTL we validate and attempt commit; insufficient balance fails first.
    await expect(
      service.accept(payload as never, { id: userId }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(accountService.findByUserId).toHaveBeenCalledWith(userId);
  });

  it('rejects when wallet balance is insufficient on a fresh key', async () => {
    idempotencyRepository.find.mockResolvedValue(undefined);
    accountService.findByUserId.mockResolvedValue({
      id: 'acc-1',
      balance: 100n,
    });

    await expect(
      service.accept(payload as never, { id: userId }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    try {
      await service.accept(payload as never, { id: userId });
      fail('expected UnprocessableEntityException');
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      const response = (
        error as UnprocessableEntityException
      ).getResponse() as { message: string };
      expect(response.message).toBe(COMMON_ERRORS.INSUFFICIENT_BALANCE);
    }
  });
});

describe('hashTransferPayload', () => {
  it('is stable for the same canonical fields', () => {
    const a = hashTransferPayload({
      userId: 'u1',
      amount: 500,
      currency: 'NGN',
      bankCode: '058',
      accountNumber: '123',
    });
    const b = hashTransferPayload({
      userId: 'u1',
      amount: '500',
      currency: 'NGN',
      bankCode: '058',
      accountNumber: '123',
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});
