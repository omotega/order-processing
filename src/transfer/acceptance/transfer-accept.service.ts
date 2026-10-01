import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { newId } from '@/utils/id';
import { AccountService } from '@/ledger/account.service';
import { AccountRepository } from '@database/repository/account.repository';
import { LedgerService } from '@/ledger/ledger.service';
import { TransferRepository } from '@database/repository/transfer.repository';
import { LimitsService } from '@/limits/limits.service';
import { OutboxRepository } from '@database/repository/outbox.repository';
import type { TransferDto } from '@/transfer/dto/transfer.validation';
import type { TransferAcceptResponse } from '@/transfer/dto/transfer-accept.response';
import { COMMON_ERRORS, BANKING_ERRORS } from '@/common/errors/index';
import { isClassifiedError } from '@/common/errors/classified.error';
import { PaymentProviderFactory } from '@/payment-providers/payment-provider.factory';
import type {
  IdempotencyKey,
  JsonValue,
  NewOutboxMessage,
  NewPayment,
  NewTransaction,
} from '@/database/database.types';
import {
  EntryDirection,
  IdempotencyKeyState,
  AccountSubtype,
  IdempotencyScopeType,
  LedgerSourceType,
  PaymentMethod,
  PaymentProcessingStatus,
  PaymentProvider,
  PaymentStatus,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
} from '@/utils/database.enums';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor } from '@/database/db-executor';
import { hashTransferPayload } from '@/transfer/acceptance/transfer-payload-hash';
import {
  TransferLogEvents,
  logTransfer,
} from '@/transfer/observability/transfer-log.events';
import {
  TRANSFER_LOG_STAGE,
  type TransferLogContextInput,
} from '@/transfer/observability/transfer-log.context';
import {
  IdempotencyRepository,
  TRANSFER_ACCEPT_OPERATION,
} from '@database/repository/idempotency.repository';
import { TransferIdempotencyService } from '@/transfer/acceptance/transfer-idempotency.service';
import { KafkaService } from '@/kafka/kafka.service';
import { TransferTopic } from '@/kafka/kafka.topics';
import type { TransferJob } from '@/transfer/dto/transfer-job.schema';

export type { TransferAcceptResponse } from '@/transfer/dto/transfer-accept.response';

type AcceptBaseLog = Omit<TransferLogContextInput, 'event'> &
  Pick<TransferLogContextInput, 'stage'>;

type AcceptContext = {
  requestId: string;
  startedAt: number;
  amount: bigint;
  requestHash: string;
  baseLog: AcceptBaseLog;
  payload: TransferDto['body'];
  userId: string;
  idempotencyKey: string;
};

type TransferHoldCommitResult = {
  paymentId: string;
  transactionId: string;
  ledgerTransactionId: string;
  outboxId: string;
  provider: PaymentProvider;
  accepted: TransferAcceptResponse;
  transferJob: TransferJob;
};

const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TransferAcceptService {
  private readonly logger = new Logger(TransferAcceptService.name);

  constructor(
    private readonly accountService: AccountService,
    private readonly accountRepository: AccountRepository,
    private readonly ledgerService: LedgerService,
    private readonly transferRepository: TransferRepository,
    private readonly limitsService: LimitsService,
    private readonly outboxRepository: OutboxRepository,
    private readonly paymentProviderFactory: PaymentProviderFactory,
    private readonly idempotencyRepository: IdempotencyRepository,
    private readonly transferIdempotencyService: TransferIdempotencyService,
    private readonly db: DatabaseService,
    private readonly kafkaService: KafkaService,
  ) {}

  async accept(
    payload: TransferDto['body'],
    user: { id: string },
    idempotencyKey: string,
    correlationId: string,
  ): Promise<TransferAcceptResponse> {
    const ctx = this.buildAcceptContext(
      payload,
      user,
      idempotencyKey,
      correlationId,
    );

    logTransfer(this.logger, TransferLogEvents.ACCEPT_STARTED, ctx.baseLog);

    try {
      const idempotentResponse =
        await this.tryBuildIdempotentAcceptResponse(ctx);
      if (idempotentResponse) {
        return idempotentResponse;
      }

      const preparedTransfer = await this.prepareNewTransferAccept(ctx);

      const heldTransfer = await this.persistTransferHoldAndEnqueueOutbox(
        ctx,
        preparedTransfer.reference,
        preparedTransfer.paymentProvider,
      );

      await this.publishTransferJob(
        heldTransfer,
        ctx,
        preparedTransfer.reference,
      );
      this.logAcceptSuccess(ctx, preparedTransfer.reference, heldTransfer);
      return heldTransfer.accepted;
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        const idempotentResponse =
          await this.tryBuildIdempotentAcceptResponse(ctx);
        if (idempotentResponse) {
          return idempotentResponse;
        }
      }

      if (this.isClientHttpError(error)) {
        throw error;
      }

      logTransfer(this.logger, TransferLogEvents.ACCEPT_FAILED, {
        ...ctx.baseLog,
        errorMessage: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - ctx.startedAt,
      });
      throw error;
    }
  }

  private async tryBuildIdempotentAcceptResponse(
    ctx: AcceptContext,
  ): Promise<TransferAcceptResponse | undefined> {
    const existing = await this.idempotencyRepository.find({
      scopeType: IdempotencyScopeType.USER,
      scopeId: ctx.userId,
      operationType: TRANSFER_ACCEPT_OPERATION,
      key: ctx.idempotencyKey,
    });

    if (!existing) {
      return undefined;
    }

    return this.resolveExistingKey(ctx, existing);
  }

  private logAcceptSuccess(
    ctx: AcceptContext,
    reference: string,
    heldTransfer: TransferHoldCommitResult,
  ): void {
    logTransfer(this.logger, TransferLogEvents.HOLD_COMMITTED, {
      ...ctx.baseLog,
      reference,
      paymentId: heldTransfer.paymentId,
      transactionId: heldTransfer.transactionId,
      ledgerTransactionId: heldTransfer.ledgerTransactionId,
      paymentStatus: PaymentStatus.PENDING,
      transactionStatus: TransactionStatus.PENDING,
      nextStatus: PaymentStatus.PENDING,
      provider: heldTransfer.provider,
    });
    logTransfer(this.logger, TransferLogEvents.OUTBOX_WRITTEN, {
      ...ctx.baseLog,
      reference,
      paymentId: heldTransfer.paymentId,
      outboxId: heldTransfer.outboxId,
      kafkaTopic: TransferTopic.JOBS,
    });
    logTransfer(this.logger, TransferLogEvents.ACCEPT_ACCEPTED, {
      ...ctx.baseLog,
      reference,
      paymentId: heldTransfer.paymentId,
      transactionId: heldTransfer.transactionId,
      durationMs: Date.now() - ctx.startedAt,
    });
  }

  private isClientHttpError(error: unknown): boolean {
    if (isClassifiedError(error) && !error.retryable) {
      return true;
    }

    return (
      error instanceof BadRequestException ||
      error instanceof UnprocessableEntityException ||
      error instanceof ConflictException
    );
  }

  private buildAcceptContext(
    payload: TransferDto['body'],
    user: { id: string },
    idempotencyKey: string,
    correlationId: string,
  ): AcceptContext {
    const requestId = correlationId;
    return {
      requestId,
      startedAt: Date.now(),
      amount: BigInt(payload.amount),
      requestHash: hashTransferPayload({
        userId: user.id,
        amount: payload.amount,
        currency: 'NGN',
        bankCode: payload.bankCode,
        accountNumber: payload.accountNumber,
      }),
      baseLog: {
        stage: TRANSFER_LOG_STAGE.ACCEPT,
        component: 'TransferAcceptService',
        operation: 'accept',
        correlationId: requestId,
        idempotencyKey,
        userId: user.id,
        amount: payload.amount,
        currency: 'NGN',
        bankCode: payload.bankCode,
        accountNumber: payload.accountNumber,
      },
      payload,
      userId: user.id,
      idempotencyKey,
    };
  }

  private async resolveExistingKey(
    ctx: AcceptContext,
    row: IdempotencyKey,
  ): Promise<TransferAcceptResponse> {
    if (row.requestHash !== ctx.requestHash) {
      logTransfer(this.logger, TransferLogEvents.ACCEPT_REJECTED, {
        ...ctx.baseLog,
        reason: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
        durationMs: Date.now() - ctx.startedAt,
      });
      throw new ConflictException(
        'Idempotency key already used with a different transfer payload',
      );
    }

    if (row.state === IdempotencyKeyState.COMPLETE && row.resourceId) {
      const current =
        await this.transferIdempotencyService.buildResponseFromResourceId(
          row.resourceId,
          ctx.requestId,
          row.state,
        );
      if (current) {
        return current;
      }
    }

    if (
      (row.state === IdempotencyKeyState.IN_PROGRESS ||
        row.state === IdempotencyKeyState.PENDING_UNCERTAIN) &&
      row.response
    ) {
      return row.response as unknown as TransferAcceptResponse;
    }

    if (row.resourceId) {
      const rebuilt =
        await this.transferIdempotencyService.buildResponseFromResourceId(
          row.resourceId,
          ctx.requestId,
          row.state,
        );
      if (rebuilt) {
        return rebuilt;
      }
    }

    throw new ConflictException('Idempotency key is not in a replayable state');
  }

  private assertSufficientBalance(
    balance: bigint | string | number,
    amount: bigint,
  ): void {
    if (BigInt(balance) < amount) {
      throw new UnprocessableEntityException(
        COMMON_ERRORS.INSUFFICIENT_BALANCE,
      );
    }
  }

  private async prepareNewTransferAccept(ctx: AcceptContext): Promise<{
    paymentProvider: PaymentProvider;
    reference: string;
  }> {
    const account = await this.accountService.findByUserId(ctx.userId);
    if (!account) {
      logTransfer(this.logger, TransferLogEvents.ACCEPT_REJECTED, {
        ...ctx.baseLog,
        reason: BANKING_ERRORS.WALLET_ACCOUNT_NOT_FOUND,
        durationMs: Date.now() - ctx.startedAt,
      });
      throw new BadRequestException(BANKING_ERRORS.WALLET_ACCOUNT_NOT_FOUND);
    }

    if (BigInt(account.balance) < ctx.amount) {
      logTransfer(this.logger, TransferLogEvents.ACCEPT_REJECTED, {
        ...ctx.baseLog,
        reason: COMMON_ERRORS.INSUFFICIENT_BALANCE,
        durationMs: Date.now() - ctx.startedAt,
      });
      throw new UnprocessableEntityException(
        COMMON_ERRORS.INSUFFICIENT_BALANCE,
      );
    }

    const paymentProvider =
      await this.paymentProviderFactory.resolveActiveProvider();
    const reference = newId();

    logTransfer(this.logger, TransferLogEvents.ACCEPT_VALIDATED, {
      ...ctx.baseLog,
      reference,
      provider: paymentProvider,
    });

    return { paymentProvider, reference };
  }

  private async persistTransferHoldAndEnqueueOutbox(
    ctx: AcceptContext,
    reference: string,
    paymentProvider: PaymentProvider,
  ): Promise<TransferHoldCommitResult> {
    const { payload, userId, amount, requestHash, requestId } = ctx;
    const expiresAt = new Date(Date.now() + IDEMPOTENCY_RETENTION_MS);

    return this.db.transaction().execute(async (dbTx) => {
      await this.claimIdempotencyKey(ctx, expiresAt, dbTx);

      const ledgerAccount = await this.accountRepository.findByUserIdForUpdate(
        userId,
        dbTx,
      );
      if (!ledgerAccount) {
        throw new BadRequestException(BANKING_ERRORS.WALLET_ACCOUNT_NOT_FOUND);
      }
      this.assertSufficientBalance(ledgerAccount.balance, amount);

      const userAccount = await this.accountService.findUserAccount(
        userId,
        dbTx,
      );
      if (!userAccount) {
        throw new BadRequestException(BANKING_ERRORS.WALLET_ACCOUNT_NOT_FOUND);
      }

      await this.limitsService.reserveUsage(userId, amount, dbTx);

      const suspenseAccount =
        await this.accountService.findProviderPostingAccount(
          AccountSubtype.OUTBOUND_SUSPENSE,
          paymentProvider,
          'NGN',
          dbTx,
          { forUpdate: true },
        );
      if (!suspenseAccount) {
        throw new BadRequestException(BANKING_ERRORS.SUSPENSE_ACCOUNT_MISSING);
      }

      const holdLedgerResult = await this.ledgerService.createTransaction(
        {
          reference: `LGR-${reference}`,
          description: payload.description ?? 'Bank transfer',
          sourceType: LedgerSourceType.TRANSFER_HOLD,
          sourceId: reference,
          correlationId: requestId,
          initiatedBy: userId,
          entries: [
            {
              ledgerAccountId: ledgerAccount.id,
              direction: EntryDirection.DEBIT,
              amount,
              description: 'Outbound transfer hold',
            },
            {
              ledgerAccountId: suspenseAccount.id,
              direction: EntryDirection.CREDIT,
              amount,
              description: 'Outbound transfer suspense',
            },
          ],
        },
        dbTx,
      );

      const userLedgerEntry = holdLedgerResult.entries.find(
        (entry) => entry.ledgerAccountId === ledgerAccount.id,
      );
      if (!userLedgerEntry) {
        throw new BadRequestException(BANKING_ERRORS.WALLET_ACCOUNT_NOT_FOUND);
      }

      const paymentId = newId();
      const transactionId = newId();
      const outboxId = newId();

      await this.transferRepository.createPayment(
        {
          id: paymentId,
          userId,
          amount,
          currency: 'NGN',
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          provider: paymentProvider,
          paymentReference: reference,
          correlationId: requestId,
          status: PaymentStatus.PENDING,
          processingStatus: PaymentProcessingStatus.READY_FOR_SUBMISSION,
          feeAmount: 0n,
          netAmount: amount,
          requestHash,
          holdLedgerTransactionId: holdLedgerResult.transaction.id,
          providerClaimedAt: null,
          metadata: {
            accountNumber: payload.accountNumber,
            bankCode: payload.bankCode,
            bankName: payload.bankName,
            description: payload.description ?? 'Bank transfer',
          },
          updatedAt: new Date(),
        } as NewPayment,
        dbTx,
      );

      await this.transferRepository.createTransaction(
        {
          id: transactionId,
          userId,
          userAccountId: userAccount.id,
          userLedgerEntryId: userLedgerEntry.id,
          amount,
          currency: 'NGN',
          type: TransactionType.TRANSFER,
          status: TransactionStatus.PENDING,
          direction: TransactionDirection.OUTBOUND,
          reference,
          description: payload.description ?? '',
          ledgerTransactionId: holdLedgerResult.transaction.id,
          paymentId,
          counterpartyAccount: payload.accountNumber,
          metadata: {
            accountNumber: payload.accountNumber,
            bankCode: payload.bankCode,
            clientIdempotencyKey: ctx.idempotencyKey,
          },
        } as NewTransaction,
        dbTx,
      );

      const transferJob = {
        reference,
        userId,
        amount: payload.amount.toString(),
        currency: 'NGN',
        accountNumber: payload.accountNumber,
        bankCode: payload.bankCode,
        idempotencyKey: ctx.idempotencyKey,
        description: payload.description,
        bankName: payload.bankName,
        counterpartyName: payload.bankName ?? undefined,
        createdAt: new Date().toISOString(),
        correlationId: requestId,
        paymentId,
        transactionId,
        ledgerTransactionId: holdLedgerResult.transaction.id,
        provider: paymentProvider,
        requestHash,
      };

      await this.outboxRepository.insert(
        {
          id: outboxId,
          topic: TransferTopic.JOBS,
          key: userId,
          aggregateType: 'payment',
          aggregateId: paymentId,
          schemaVersion: 1,
          payload: transferJob as unknown as JsonValue,
          createdAt: new Date(),
        } as NewOutboxMessage,
        dbTx,
      );

      const accepted = this.transferIdempotencyService.buildProcessingResponse({
        correlationId: requestId,
        reference,
        paymentId,
        transactionId,
        paymentStatus: PaymentStatus.PENDING,
        transactionStatus: TransactionStatus.PENDING,
        provider: paymentProvider,
      });

      await this.idempotencyRepository.saveProvisionalResponse(
        {
          scopeType: IdempotencyScopeType.USER,
          scopeId: userId,
          operationType: TRANSFER_ACCEPT_OPERATION,
          key: ctx.idempotencyKey,
        },
        paymentId,
        accepted as unknown as JsonValue,
        dbTx,
      );

      return {
        paymentId,
        transactionId,
        ledgerTransactionId: holdLedgerResult.transaction.id,
        outboxId,
        provider: paymentProvider,
        accepted,
        transferJob,
      };
    });
  }

  private async publishTransferJob(
    heldTransfer: TransferHoldCommitResult,
    ctx: AcceptContext,
    reference: string,
  ): Promise<void> {
    try {
      await this.kafkaService.produce(TransferTopic.JOBS, {
        key: ctx.userId,
        value: heldTransfer.transferJob as unknown as Record<string, unknown>,
        headers: { eventId: heldTransfer.outboxId },
      });
    } catch (error) {
      this.logger.error('Failed to publish transfer job to Kafka', {
        reference,
        paymentId: heldTransfer.paymentId,
        outboxId: heldTransfer.outboxId,
        correlationId: ctx.requestId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async claimIdempotencyKey(
    ctx: AcceptContext,
    expiresAt: Date,
    dbTx: DbExecutor,
  ): Promise<void> {
    const beginInput = {
      scopeType: IdempotencyScopeType.USER,
      scopeId: ctx.userId,
      operationType: TRANSFER_ACCEPT_OPERATION,
      key: ctx.idempotencyKey,
      requestHash: ctx.requestHash,
      expiresAt,
    };

    const claim = await this.idempotencyRepository.tryBegin(beginInput, dbTx);
    if (claim === 'conflict') {
      throw new IdempotencyConflictError();
    }
  }
}

class IdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency claim conflict');
    this.name = 'IdempotencyConflictError';
  }
}
