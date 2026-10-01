import { Injectable, Logger } from '@nestjs/common';
import { TransferRepository } from '@database/repository/transfer.repository';
import { PaymentProviderFactory } from '@/payment-providers/payment-provider.factory';
import { AuditService } from '@/audit/audit.service';
import { TransferReverseService } from '@/transfer/reversal/transfer-reverse.service';
import { TransferVerifyQueueService } from '@/transfer/verification/transfer-verify-queue.service';
import { TransferIdempotencyService } from '@/transfer/acceptance/transfer-idempotency.service';
import {
  TransferReversalCoordinator,
  TransferReversalRequestStatus,
} from '@/transfer/reversal/transfer-reversal-coordinator.service';
import { TRANSFER_REVERSAL_ALLOWED_STATUSES } from '@/transfer/reversal/transfer-reversal.constants';
import { SETTLEMENT_VERIFY_FAST_DELAY_MS } from '@/transfer/verification/transfer-verify-queue.constants';
import type { TransferJob } from '@/transfer/dto/transfer-job.schema';
import type { Payment, Transaction } from '@/database/database.types';
import {
  ActorType,
  PaymentProcessingStatus,
  PaymentStatus,
  TransactionStatus,
} from '@/utils/database.enums';
import {
  TransferLogEvents,
  logTransfer,
} from '@/transfer/observability/transfer-log.events';
import { TRANSFER_LOG_STAGE } from '@/transfer/observability/transfer-log.context';
import { ProviderSubmitOutcome } from '@/transfer/processing/transfer-provider-outcome';

export { ProviderSubmitOutcome } from '@/transfer/processing/transfer-provider-outcome';

@Injectable()
export class TransferOrchestrator {
  private readonly logger = new Logger(TransferOrchestrator.name);

  constructor(
    private readonly transferRepository: TransferRepository,
    private readonly paymentProviderFactory: PaymentProviderFactory,
    private readonly reverseService: TransferReverseService,
    private readonly reversalCoordinator: TransferReversalCoordinator,
    private readonly auditService: AuditService,
    private readonly transferVerifyQueue: TransferVerifyQueueService,
    private readonly transferIdempotencyService: TransferIdempotencyService,
  ) {}

  async processTransferJob(transferJob: TransferJob): Promise<{
    processingOutcome: ProviderSubmitOutcome;
  }> {
    logTransfer(this.logger, TransferLogEvents.PROCESSING_STARTED, {
      stage: TRANSFER_LOG_STAGE.ORCHESTRATOR,
      component: 'TransferOrchestrator',
      operation: 'processTransferJob',
      correlationId: transferJob.correlationId,
      reference: transferJob.reference,
      idempotencyKey: transferJob.idempotencyKey,
      userId: transferJob.userId,
      amount: transferJob.amount,
      currency: transferJob.currency,
      bankCode: transferJob.bankCode,
      accountNumber: transferJob.accountNumber,
      paymentId: transferJob.paymentId,
      transactionId: transferJob.transactionId,
      provider: transferJob.provider,
    });

    const payment = await this.transferRepository.findPaymentById(
      transferJob.paymentId,
    );
    if (!payment) {
      return this.skipJob(transferJob, 'PAYMENT_NOT_FOUND');
    }

    const transferRecord = await this.transferRepository.findTransactionById(
      transferJob.transactionId,
    );
    if (!transferRecord) {
      return this.skipJob(transferJob, 'TRANSACTION_NOT_FOUND');
    }
    if (
      transferRecord.paymentId !== payment.id ||
      payment.paymentReference !== transferJob.reference ||
      transferRecord.userId !== transferJob.userId
    ) {
      return this.skipJob(transferJob, 'JOB_RECORD_MISMATCH');
    }

    const claimed = await this.transferRepository.claimPaymentForSubmit(
      payment.id,
    );
    if (!claimed) {
      const latest = await this.transferRepository.findPaymentById(payment.id);
      logTransfer(this.logger, TransferLogEvents.PAYMENT_CLAIM_SKIPPED, {
        stage: TRANSFER_LOG_STAGE.ORCHESTRATOR,
        paymentId: payment.id,
        paymentStatus: latest?.status,
        correlationId: transferJob.correlationId,
        reference: transferJob.reference,
      });
      await this.transferIdempotencyService.finalizeFromProviderOutcome(
        transferJob,
        ProviderSubmitOutcome.SKIPPED,
      );
      return { processingOutcome: ProviderSubmitOutcome.SKIPPED };
    }

    logTransfer(this.logger, TransferLogEvents.PAYMENT_CLAIMED, {
      stage: TRANSFER_LOG_STAGE.ORCHESTRATOR,
      paymentId: payment.id,
      paymentStatus: PaymentStatus.PENDING,
      paymentProcessingStatus: PaymentProcessingStatus.SUBMITTING,
      reason: 'PROVIDER_CLAIMED',
      provider: payment.provider,
      correlationId: transferJob.correlationId,
      reference: transferJob.reference,
    });

    return this.submitTransferToPaymentProvider(
      transferJob,
      transferRecord,
      claimed,
    );
  }

  private async finalizeIdempotency(
    transferJob: TransferJob,
    outcome: ProviderSubmitOutcome,
  ): Promise<void> {
    await this.transferIdempotencyService.finalizeFromProviderOutcome(
      transferJob,
      outcome,
    );
  }

  private async submitTransferToPaymentProvider(
    transferJob: TransferJob,
    transferRecord: Transaction,
    payment: Payment,
  ): Promise<{
    processingOutcome: ProviderSubmitOutcome;
  }> {
    const adapter = this.paymentProviderFactory.resolve(payment.provider);

    logTransfer(this.logger, TransferLogEvents.PROVIDER_SUBMIT_STARTED, {
      stage: TRANSFER_LOG_STAGE.PROVIDER,
      component: 'TransferOrchestrator',
      operation: 'submitTransferToPaymentProvider',
      paymentId: payment.id,
      transactionId: transferRecord.id,
      provider: payment.provider,
      bankCode: transferJob.bankCode,
      accountNumber: transferJob.accountNumber,
      correlationId: transferJob.correlationId,
      reference: transferJob.reference,
    });

    try {
      const providerResult = await adapter.initiateTransfer({
        reference: transferJob.reference,
        amount: BigInt(transferJob.amount),
        accountNumber: transferJob.accountNumber,
        bankCode: transferJob.bankCode,
        idempotencyKey: transferJob.reference,
        narration: transferJob.description ?? 'Bank transfer',
        recipientName: transferJob.counterpartyName,
      });

      if (providerResult.outcome === 'ACCEPTED') {
        const externalReference =
          providerResult.externalReference ?? transferJob.reference;
        const updated = await this.transferRepository.markProviderAccepted(
          payment.id,
          externalReference,
        );
        if (!updated) {
          await this.reconcileLostTransition(payment.id);
          await this.finalizeIdempotency(
            transferJob,
            ProviderSubmitOutcome.SKIPPED,
          );
          return { processingOutcome: ProviderSubmitOutcome.SKIPPED };
        }

        logTransfer(this.logger, TransferLogEvents.PROVIDER_ACCEPTED, {
          stage: TRANSFER_LOG_STAGE.PROVIDER,
          paymentId: payment.id,
          previousStatus: PaymentStatus.PENDING,
          previousProcessingStatus: PaymentProcessingStatus.SUBMITTING,
          nextStatus: PaymentStatus.PENDING,
          nextProcessingStatus: PaymentProcessingStatus.AWAITING_SETTLEMENT,
          externalReference,
          transactionStatus: TransactionStatus.PENDING,
          provider: payment.provider,
          correlationId: transferJob.correlationId,
          reference: transferJob.reference,
        });

        await this.auditService.log({
          actorType: ActorType.SYSTEM,
          actorId: transferJob.userId,
          action: 'TRANSFER_PROVIDER_ACCEPTED',
          resourceType: 'payment',
          resourceId: payment.id,
          changes: {
            after: {
              reference: transferJob.reference,
              externalReference,
              provider: payment.provider,
            },
          },
        });

        try {
          await this.transferVerifyQueue.enqueueSettlementVerify({
            paymentId: payment.id,
            reference: transferJob.reference,
            attempt: 1,
            correlationId: transferJob.correlationId,
            delayMs: SETTLEMENT_VERIFY_FAST_DELAY_MS,
          });
        } catch (error) {
          logTransfer(this.logger, TransferLogEvents.STUCK_PAYMENT_ALERT, {
            stage: TRANSFER_LOG_STAGE.PROVIDER,
            paymentId: payment.id,
            reference: transferJob.reference,
            reason: 'SETTLEMENT_VERIFY_ENQUEUE_FAILED',
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
        }

        await this.finalizeIdempotency(
          transferJob,
          ProviderSubmitOutcome.PSP_ACCEPTED,
        );
        return { processingOutcome: ProviderSubmitOutcome.PSP_ACCEPTED };
      }

      if (providerResult.outcome === 'UNKNOWN') {
        const failureReason =
          providerResult.message ?? 'Provider outcome uncertain';
        const updated = await this.transferRepository.markUnknownFromSubmitting(
          payment.id,
          failureReason,
        );
        if (!updated) {
          await this.reconcileLostTransition(payment.id);
          await this.finalizeIdempotency(
            transferJob,
            ProviderSubmitOutcome.SKIPPED,
          );
          return { processingOutcome: ProviderSubmitOutcome.SKIPPED };
        }

        logTransfer(this.logger, TransferLogEvents.PROVIDER_OUTCOME_UNKNOWN, {
          stage: TRANSFER_LOG_STAGE.PROVIDER,
          paymentId: payment.id,
          previousStatus: PaymentStatus.PENDING,
          previousProcessingStatus: PaymentProcessingStatus.SUBMITTING,
          nextStatus: PaymentStatus.PENDING,
          nextProcessingStatus: PaymentProcessingStatus.UNKNOWN,
          reason: 'PROVIDER_OUTCOME_UNKNOWN',
          errorMessage: failureReason,
          providerCode: providerResult.code,
          providerHttpStatus: providerResult.httpStatus,
          providerStep: providerResult.step,
          transactionStatus: TransactionStatus.PENDING,
          provider: payment.provider,
          correlationId: transferJob.correlationId,
          reference: transferJob.reference,
        });

        await this.finalizeIdempotency(
          transferJob,
          ProviderSubmitOutcome.PSP_UNKNOWN,
        );
        return { processingOutcome: ProviderSubmitOutcome.PSP_UNKNOWN };
      }

      const reason = providerResult.message ?? 'Provider rejected transfer';
      const reversal = await this.reversalCoordinator.request({
        paymentId: payment.id,
        transactionId: transferRecord.id,
        reason,
        fromStatuses: TRANSFER_REVERSAL_ALLOWED_STATUSES.SUBMIT_REJECTED,
        correlationId: transferJob.correlationId,
      });

      if (reversal.status === TransferReversalRequestStatus.STARTED) {
        await this.reverseService.processReverseJob(reversal.job);
      }

      logTransfer(this.logger, TransferLogEvents.PROVIDER_REJECTED, {
        stage: TRANSFER_LOG_STAGE.PROVIDER,
        paymentId: payment.id,
        previousStatus: PaymentStatus.PENDING,
        previousProcessingStatus: PaymentProcessingStatus.SUBMITTING,
        nextStatus: PaymentStatus.REVERSAL_PENDING,
        reason: 'PROVIDER_REJECTED',
        errorMessage: reason,
        providerCode: providerResult.code,
        providerHttpStatus: providerResult.httpStatus,
        providerStep: providerResult.step,
        transactionStatus: TransactionStatus.PENDING,
        provider: payment.provider,
        correlationId: transferJob.correlationId,
        reference: transferJob.reference,
      });

      await this.finalizeIdempotency(
        transferJob,
        ProviderSubmitOutcome.PSP_REJECTED,
      );
      return { processingOutcome: ProviderSubmitOutcome.PSP_REJECTED };
    } catch (error) {
      // Any thrown error is non-authoritative: the request may have reached
      // the PSP. Keep funds held and verify; never reverse on an exception.
      const failureReason =
        error instanceof Error ? error.message : String(error);
      const updated = await this.transferRepository.markUnknownFromSubmitting(
        payment.id,
        failureReason,
      );
      if (!updated) {
        await this.reconcileLostTransition(payment.id);
        await this.finalizeIdempotency(
          transferJob,
          ProviderSubmitOutcome.SKIPPED,
        );
        return { processingOutcome: ProviderSubmitOutcome.SKIPPED };
      }

      logTransfer(this.logger, TransferLogEvents.PROVIDER_OUTCOME_UNKNOWN, {
        stage: TRANSFER_LOG_STAGE.PROVIDER,
        paymentId: payment.id,
        previousStatus: PaymentStatus.PENDING,
        previousProcessingStatus: PaymentProcessingStatus.SUBMITTING,
        nextStatus: PaymentStatus.PENDING,
        nextProcessingStatus: PaymentProcessingStatus.UNKNOWN,
        reason: 'PROVIDER_OUTCOME_UNKNOWN',
        errorMessage: failureReason,
        errorName: error instanceof Error ? error.name : undefined,
        transactionStatus: TransactionStatus.PENDING,
        provider: payment.provider,
        correlationId: transferJob.correlationId,
        reference: transferJob.reference,
      });

      await this.auditService.log({
        actorType: ActorType.SYSTEM,
        actorId: transferJob.userId,
        action: 'TRANSFER_PROVIDER_OUTCOME_UNKNOWN',
        resourceType: 'payment',
        resourceId: payment.id,
        changes: {
          after: {
            reference: transferJob.reference,
            failureReason,
            provider: payment.provider,
          },
        },
      });

      await this.finalizeIdempotency(
        transferJob,
        ProviderSubmitOutcome.PSP_UNKNOWN,
      );
      return { processingOutcome: ProviderSubmitOutcome.PSP_UNKNOWN };
    }
  }

  private skipJob(
    transferJob: TransferJob,
    reason: string,
  ): { processingOutcome: ProviderSubmitOutcome } {
    logTransfer(this.logger, TransferLogEvents.PAYMENT_CLAIM_SKIPPED, {
      stage: TRANSFER_LOG_STAGE.ORCHESTRATOR,
      paymentId: transferJob.paymentId,
      transactionId: transferJob.transactionId,
      correlationId: transferJob.correlationId,
      reference: transferJob.reference,
      reason,
    });
    return { processingOutcome: ProviderSubmitOutcome.SKIPPED };
  }

  private async reconcileLostTransition(paymentId: string): Promise<void> {
    const latest = await this.transferRepository.findPaymentById(paymentId);
    if (!latest) {
      return;
    }
    logTransfer(this.logger, TransferLogEvents.PAYMENT_CLAIM_SKIPPED, {
      stage: TRANSFER_LOG_STAGE.ORCHESTRATOR,
      paymentId,
      paymentStatus: latest.status,
      reason: 'TRANSITION_RACE_LOST',
    });
  }
}
