import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { newId } from '@/utils/id';
import { TransferRepository } from '@database/repository/transfer.repository';
import { OutboxRepository } from '@database/repository/outbox.repository';
import { PaymentProviderFactory } from '@/payment-providers/payment-provider.factory';
import type { VerifyTransferResult } from '@/payment-providers/payment-provider.types';
import { AuditService } from '@/audit/audit.service';
import {
  ActorType,
  PaymentProcessingStatus,
  PaymentStatus,
} from '@/utils/database.enums';
import type {
  JsonValue,
  NewOutboxMessage,
  Payment,
} from '@/database/database.types';
import {
  TransferLogEvents,
  logTransfer,
} from '@/transfer/observability/transfer-log.events';
import { TRANSFER_LOG_STAGE } from '@/transfer/observability/transfer-log.context';
import { TransferSettlementSource } from '@/transfer/settlement/transfer-settlement.constants';
import { appConfig } from '@/config/config';
import { TransferReverseService } from '@/transfer/reversal/transfer-reverse.service';
import { TransferSettlementService } from '@/transfer/settlement/transfer-settlement.service';
import { TransferIdempotencyService } from '@/transfer/acceptance/transfer-idempotency.service';
import { IdempotencyVerificationOutcome } from '@/transfer/processing/transfer-provider-outcome';
import {
  TransferReversalCoordinator,
  TransferReversalRequestStatus,
} from '@/transfer/reversal/transfer-reversal-coordinator.service';
import { TRANSFER_REVERSAL_ALLOWED_STATUSES } from '@/transfer/reversal/transfer-reversal.constants';
import {
  amountsMatch,
  currenciesMatch,
  TRANSFER_RECONCILIATION_REASON,
} from '@/transfer/provider-events/transfer-money.guards';
import { KafkaService } from '@/kafka/kafka.service';
import { TransferTopic } from '@/kafka/kafka.topics';
import { TransientError } from '@/kafka/retry-with-jitter';
import {
  errorLogContext,
  isClassifiedError,
} from '@/common/errors/classified.error';
import type { TransferReverseJob } from '@/transfer/dto/transfer-job.schema';
import {
  SETTLEMENT_VERIFY_FAST_ATTEMPTS,
  SETTLEMENT_VERIFY_FAST_DELAY_MS,
  SETTLEMENT_VERIFY_MAX_ATTEMPTS,
  type SettlementVerifyAction,
  type SettlementVerifyJob,
} from '@/transfer/verification/transfer-verify-queue.constants';

const STUCK_REVERSAL_MS = 5 * 60 * 1000;
const STUCK_UNKNOWN_CRITICAL_MS = 30 * 60 * 1000;

@Injectable()
export class TransferVerifyService {
  private readonly logger = new Logger(TransferVerifyService.name);
  private running = false;

  constructor(
    private readonly transferRepository: TransferRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly paymentProviderFactory: PaymentProviderFactory,
    private readonly auditService: AuditService,
    private readonly reverseService: TransferReverseService,
    private readonly transferSettlementService: TransferSettlementService,
    private readonly reversalCoordinator: TransferReversalCoordinator,
    private readonly transferIdempotencyService: TransferIdempotencyService,
    private readonly kafkaService: KafkaService,
  ) {}

  @Interval(30_000)
  async poll(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.verifyUncertainPayments();
      await this.alertStuckPayments();
    } catch (error) {
      this.logger.error('Transfer verify poll failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
    }
  }

  /**
   * Case 1: delayed BullMQ job after initiate ACCEPTED.
   * Does not enqueue; the queue worker re-delays from the returned action.
   */
  async verifyAwaitingSettlement(
    job: SettlementVerifyJob,
  ): Promise<SettlementVerifyAction> {
    const payment = await this.transferRepository.findPaymentById(
      job.paymentId,
    );
    if (
      !payment ||
      payment.status === PaymentStatus.COMPLETED ||
      payment.settlementLedgerTransactionId
    ) {
      return { action: 'STOP' };
    }
    if (
      payment.status === PaymentStatus.FAILED ||
      payment.status === PaymentStatus.REVERSAL_PENDING
    ) {
      return { action: 'STOP' };
    }

    const adapter = this.paymentProviderFactory.resolve(payment.provider);
    if (!adapter.verifyTransfer) {
      return this.redelayOrStop(job, payment);
    }

    let verifyResult: VerifyTransferResult;
    try {
      verifyResult = await adapter.verifyTransfer({
        reference: job.reference,
        externalReference: payment.externalReference ?? undefined,
      });
    } catch (error) {
      logTransfer(this.logger, TransferLogEvents.VERIFY_STILL_UNKNOWN, {
        stage: TRANSFER_LOG_STAGE.VERIFY,
        paymentId: payment.id,
        reference: job.reference,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return this.redelayOrStop(job, payment);
    }

    if (verifyResult.outcome === 'SUCCESS') {
      if (
        verifyResult.amount !== undefined &&
        !amountsMatch(payment.amount, verifyResult.amount)
      ) {
        logTransfer(this.logger, TransferLogEvents.STUCK_PAYMENT_ALERT, {
          stage: TRANSFER_LOG_STAGE.VERIFY,
          paymentId: payment.id,
          reference: job.reference,
          reason: TRANSFER_RECONCILIATION_REASON.AMOUNT_MISMATCH,
        });
        return { action: 'STOP' };
      }
      if (
        verifyResult.currency !== undefined &&
        !currenciesMatch(payment.currency, verifyResult.currency)
      ) {
        logTransfer(this.logger, TransferLogEvents.STUCK_PAYMENT_ALERT, {
          stage: TRANSFER_LOG_STAGE.VERIFY,
          paymentId: payment.id,
          reference: job.reference,
          reason: TRANSFER_RECONCILIATION_REASON.CURRENCY_MISMATCH,
        });
        return { action: 'STOP' };
      }
      try {
        await this.transferSettlementService.settle({
          paymentId: payment.id,
          reference: payment.paymentReference,
          correlationId: job.correlationId,
          source: TransferSettlementSource.VERIFY,
        });
      } catch (error) {
        if (isClassifiedError(error) && !error.retryable) {
          logTransfer(this.logger, TransferLogEvents.STUCK_PAYMENT_ALERT, {
            stage: TRANSFER_LOG_STAGE.VERIFY,
            paymentId: payment.id,
            reference: job.reference,
            reason: error.code,
            diagnostics: errorLogContext(error),
          });
          return { action: 'STOP' };
        }
        throw error;
      }
      await this.transferIdempotencyService.finalizeFromVerification(
        payment.id,
        IdempotencyVerificationOutcome.ACCEPTED,
      );
      return { action: 'SETTLED' };
    }

    if (verifyResult.outcome === 'REJECTED') {
      await this.requestAndProcessReversal(payment, verifyResult);
      await this.transferIdempotencyService.finalizeFromVerification(
        payment.id,
        IdempotencyVerificationOutcome.REJECTED,
      );
      return { action: 'STOP' };
    }

    await this.transferIdempotencyService.finalizeFromVerification(
      payment.id,
      IdempotencyVerificationOutcome.UNKNOWN,
    );
    return this.redelayOrStop(job, payment);
  }

  private redelayOrStop(
    job: SettlementVerifyJob,
    payment: { id: string; paymentReference: string },
  ): SettlementVerifyAction {
    if (job.attempt >= SETTLEMENT_VERIFY_MAX_ATTEMPTS) {
      logTransfer(this.logger, TransferLogEvents.STUCK_PAYMENT_ALERT, {
        stage: TRANSFER_LOG_STAGE.VERIFY,
        paymentId: payment.id,
        reference: payment.paymentReference,
        reason: 'SETTLEMENT_VERIFY_ATTEMPTS_EXHAUSTED',
        attempt: job.attempt,
      });
      return { action: 'STOP' };
    }
    const delayMs =
      job.attempt < SETTLEMENT_VERIFY_FAST_ATTEMPTS
        ? SETTLEMENT_VERIFY_FAST_DELAY_MS
        : Math.min(
            300_000,
            SETTLEMENT_VERIFY_FAST_DELAY_MS *
              2 ** (job.attempt - SETTLEMENT_VERIFY_FAST_ATTEMPTS + 1),
          );
    return { action: 'REDELAY', delayMs };
  }

  private async requestAndProcessReversal(
    payment: Payment,
    verifyResult: VerifyTransferResult,
  ): Promise<void> {
    const context =
      await this.transferRepository.findPaymentWithTransactionByReference(
        payment.paymentReference,
      );
    if (!context) {
      throw new TransientError(
        `Transaction missing for verified payment ${payment.id}`,
      );
    }

    const reason = verifyResult.message ?? 'Verified as rejected by provider';
    const reversal = await this.reversalCoordinator.request({
      paymentId: payment.id,
      transactionId: context.transaction.id,
      reason,
      fromStatuses: TRANSFER_REVERSAL_ALLOWED_STATUSES.VERIFY_REJECTED,
      correlationId: payment.correlationId,
    });

    if (
      reversal.status === TransferReversalRequestStatus.STARTED ||
      reversal.status === TransferReversalRequestStatus.ALREADY_PENDING
    ) {
      await this.reverseService.processReverseJob(reversal.job);
    }

    if (reversal.status === TransferReversalRequestStatus.STARTED) {
      logTransfer(this.logger, TransferLogEvents.VERIFY_RESOLVED_REJECTED, {
        stage: TRANSFER_LOG_STAGE.VERIFY,
        paymentId: payment.id,
        nextStatus: PaymentStatus.REVERSAL_PENDING,
        reference: payment.paymentReference,
      });
    }
  }

  private async verifyUncertainPayments(): Promise<void> {
    const payments =
      await this.transferRepository.findPaymentsNeedingVerification(25);

    for (const payment of payments) {
      const claimed = await this.transferRepository.claimPaymentForVerification(
        payment.id,
      );
      if (!claimed) {
        continue;
      }
      logTransfer(this.logger, TransferLogEvents.VERIFY_STARTED, {
        stage: TRANSFER_LOG_STAGE.VERIFY,
        component: 'TransferVerifyService',
        operation: 'verifyUncertainPayments',
        paymentId: claimed.id,
        paymentStatus: claimed.status,
        paymentProcessingStatus: claimed.processingStatus,
        provider: claimed.provider,
        reference: claimed.paymentReference,
      });

      const adapter = this.paymentProviderFactory.resolve(claimed.provider);
      if (!adapter.verifyTransfer) {
        logTransfer(this.logger, TransferLogEvents.VERIFY_STILL_UNKNOWN, {
          stage: TRANSFER_LOG_STAGE.VERIFY,
          paymentId: claimed.id,
          paymentStatus: claimed.status,
          paymentProcessingStatus: claimed.processingStatus,
          reason: 'VERIFY_NOT_SUPPORTED',
          reference: claimed.paymentReference,
        });
        continue;
      }

      let verifyResult;
      try {
        verifyResult = await adapter.verifyTransfer({
          reference: claimed.paymentReference,
          externalReference: claimed.externalReference ?? undefined,
        });
      } catch (error) {
        logTransfer(this.logger, TransferLogEvents.VERIFY_STILL_UNKNOWN, {
          stage: TRANSFER_LOG_STAGE.VERIFY,
          paymentId: claimed.id,
          errorMessage: error instanceof Error ? error.message : String(error),
          reference: claimed.paymentReference,
        });
        continue;
      }

      if (verifyResult.outcome === 'ACCEPTED') {
        await this.transferRepository.markProviderAccepted(
          claimed.id,
          verifyResult.externalReference ?? claimed.paymentReference,
        );
        await this.transferIdempotencyService.finalizeFromVerification(
          claimed.id,
          IdempotencyVerificationOutcome.ACCEPTED,
        );
        logTransfer(this.logger, TransferLogEvents.VERIFY_RESOLVED_ACCEPTED, {
          stage: TRANSFER_LOG_STAGE.VERIFY,
          paymentId: claimed.id,
          nextStatus: PaymentStatus.PENDING,
          nextProcessingStatus: PaymentProcessingStatus.AWAITING_SETTLEMENT,
          externalReference: verifyResult.externalReference,
          reference: claimed.paymentReference,
        });
        continue;
      }

      if (verifyResult.outcome === 'REJECTED') {
        const context =
          await this.transferRepository.findPaymentWithTransactionByReference(
            claimed.paymentReference,
          );
        if (!context) {
          throw new Error(
            `Transaction missing for verified payment ${claimed.id}`,
          );
        }
        const reason =
          verifyResult.message ?? 'Verified as rejected by provider';
        const reversal = await this.reversalCoordinator.request({
          paymentId: claimed.id,
          transactionId: context.transaction.id,
          reason,
          fromStatuses: TRANSFER_REVERSAL_ALLOWED_STATUSES.VERIFY_REJECTED,
          correlationId: claimed.correlationId,
        });

        if (reversal.status === TransferReversalRequestStatus.STARTED) {
          const outboxId = newId();
          await this.outboxRepository.insert({
            id: outboxId,
            topic: TransferTopic.REVERSE,
            key: claimed.userId,
            aggregateType: 'payment',
            aggregateId: claimed.id,
            schemaVersion: 1,
            payload: reversal.job as unknown as JsonValue,
          } as NewOutboxMessage);
          await this.publishReverseJob(claimed, reversal.job, outboxId);

          await this.transferIdempotencyService.finalizeFromVerification(
            claimed.id,
            IdempotencyVerificationOutcome.REJECTED,
          );

          logTransfer(this.logger, TransferLogEvents.VERIFY_RESOLVED_REJECTED, {
            stage: TRANSFER_LOG_STAGE.VERIFY,
            paymentId: claimed.id,
            nextStatus: PaymentStatus.REVERSAL_PENDING,
            reference: claimed.paymentReference,
          });
        }
        continue;
      }

      if (claimed.processingStatus !== PaymentProcessingStatus.UNKNOWN) {
        await this.transferRepository.markUnknownFromSubmitting(
          claimed.id,
          verifyResult.message ?? 'Still unknown after verify',
        );
        await this.transferRepository.scheduleNextVerification(
          claimed.id,
          Math.min(300_000, Math.max(30_000, claimed.retryCount * 30_000)),
        );
      } else {
        await this.transferRepository.scheduleNextVerification(
          claimed.id,
          Math.min(300_000, Math.max(30_000, claimed.retryCount * 30_000)),
        );
      }

      await this.transferIdempotencyService.finalizeFromVerification(
        claimed.id,
        IdempotencyVerificationOutcome.UNKNOWN,
      );

      logTransfer(this.logger, TransferLogEvents.VERIFY_STILL_UNKNOWN, {
        stage: TRANSFER_LOG_STAGE.VERIFY,
        paymentId: claimed.id,
        paymentStatus: claimed.status,
        paymentProcessingStatus: PaymentProcessingStatus.UNKNOWN,
        reference: claimed.paymentReference,
      });
    }
  }

  private async publishReverseJob(
    claimed: { id: string; userId: string; paymentReference: string },
    reverseJob: TransferReverseJob,
    outboxId: string,
  ): Promise<void> {
    try {
      await this.kafkaService.produce(TransferTopic.REVERSE, {
        key: claimed.userId,
        value: reverseJob as unknown as Record<string, unknown>,
        headers: { eventId: outboxId },
      });
    } catch (error) {
      this.logger.error('Failed to publish transfer reverse job to Kafka', {
        reference: claimed.paymentReference,
        paymentId: claimed.id,
        outboxId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async alertStuckPayments(): Promise<void> {
    const stuckReversals =
      await this.transferRepository.findStuckReversalPending(
        STUCK_REVERSAL_MS,
        25,
      );
    for (const payment of stuckReversals) {
      logTransfer(this.logger, TransferLogEvents.STUCK_PAYMENT_ALERT, {
        stage: TRANSFER_LOG_STAGE.VERIFY,
        paymentId: payment.id,
        paymentStatus: payment.status,
        reference: payment.paymentReference,
        reason: 'REVERSAL_PENDING_SLA_BREACH',
      });

      const transaction = await this.transferRepository.findByReference(
        payment.paymentReference,
      );
      if (!transaction) {
        continue;
      }

      try {
        await this.reverseService.processReverseJob(
          this.reversalCoordinator.buildReverseJob({
            paymentId: payment.id,
            transactionId: transaction.id,
            reference: payment.paymentReference,
            userId: payment.userId,
            amount: payment.amount.toString(),
            currency: payment.currency,
            reason: payment.failureReason ?? 'STUCK_REVERSAL_RECOVERY',
            ledgerTransactionId: transaction.ledgerTransactionId ?? undefined,
            correlationId: payment.correlationId,
          }),
        );
      } catch {
        // TransferReverseService already emitted CRITICAL + durable audit.
      }
    }

    const uncertain =
      await this.transferRepository.findPaymentsNeedingVerification(25);
    const criticalCutoff = Date.now() - STUCK_UNKNOWN_CRITICAL_MS;
    for (const payment of uncertain) {
      const updatedAt = new Date(payment.updatedAt).getTime();
      if (updatedAt < criticalCutoff) {
        logTransfer(this.logger, TransferLogEvents.STUCK_PAYMENT_ALERT, {
          stage: TRANSFER_LOG_STAGE.VERIFY,
          paymentId: payment.id,
          paymentStatus: payment.status,
          reference: payment.paymentReference,
          reason: 'UNKNOWN_SLA_BREACH',
          claimLeaseSeconds: appConfig.paymentProviderClaimLeaseSeconds,
        });

        await this.auditService.log({
          actorType: ActorType.SYSTEM,
          actorId: payment.userId,
          action: 'TRANSFER_STUCK_PAYMENT_ALERT',
          resourceType: 'payment',
          resourceId: payment.id,
          changes: {
            after: {
              reference: payment.paymentReference,
              status: payment.status,
            },
          },
        });
      }
    }

    const staleReady =
      await this.transferRepository.findReadyForSubmissionOlderThan(
        STUCK_UNKNOWN_CRITICAL_MS,
        25,
      );
    for (const payment of staleReady) {
      logTransfer(this.logger, TransferLogEvents.STUCK_PAYMENT_ALERT, {
        stage: TRANSFER_LOG_STAGE.VERIFY,
        paymentId: payment.id,
        paymentStatus: payment.status,
        reference: payment.paymentReference,
        reason: 'READY_FOR_SUBMISSION_SLA_BREACH',
      });
    }
  }
}
