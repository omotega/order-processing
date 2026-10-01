import { Injectable, Logger } from '@nestjs/common';
import type { TransferJob } from '@/transfer/dto/transfer-job.schema';
import {
  buildTransferAcceptResponse,
  buildTransferAcceptResponseFromRecords,
  TransferAcceptOutcome,
  type TransferAcceptResponse,
} from '@/transfer/dto/transfer-accept.response';
import {
  IdempotencyVerificationOutcome,
  ProviderPaymentDerivedOutcome,
  ProviderSubmitOutcome,
  type ResolvedProviderOutcome,
  toProviderSubmitOutcomeFromVerification,
} from '@/transfer/processing/transfer-provider-outcome';
import {
  TransferLogEvents,
  logTransfer,
} from '@/transfer/observability/transfer-log.events';
import { TRANSFER_LOG_STAGE } from '@/transfer/observability/transfer-log.context';
import type { Payment, Transaction } from '@/database/database.types';
import { TransferRepository } from '@database/repository/transfer.repository';
import {
  IdempotencyRepository,
  TRANSFER_ACCEPT_OPERATION,
  type IdempotencyScope,
} from '@database/repository/idempotency.repository';
import {
  IdempotencyKeyState,
  IdempotencyScopeType,
  PaymentProcessingStatus,
  PaymentStatus,
} from '@/utils/database.enums';

@Injectable()
export class TransferIdempotencyService {
  private readonly logger = new Logger(TransferIdempotencyService.name);

  constructor(
    private readonly idempotencyRepository: IdempotencyRepository,
    private readonly transferRepository: TransferRepository,
  ) {}

  buildProcessingResponse(input: {
    correlationId: string;
    reference: string;
    paymentId: string;
    transactionId: string;
    paymentStatus: PaymentStatus;
    transactionStatus: Transaction['status'];
    provider: string;
  }): TransferAcceptResponse {
    return buildTransferAcceptResponse({
      outcome: TransferAcceptOutcome.PROCESSING,
      ...input,
    });
  }

  scopeForJob(
    job: Pick<TransferJob, 'userId' | 'idempotencyKey'>,
  ): IdempotencyScope {
    return {
      scopeType: IdempotencyScopeType.USER,
      scopeId: job.userId,
      operationType: TRANSFER_ACCEPT_OPERATION,
      key: job.idempotencyKey,
    };
  }

  async buildResponseFromResourceId(
    paymentId: string,
    correlationId: string,
    idempotencyState?: IdempotencyKeyState,
  ): Promise<TransferAcceptResponse | undefined> {
    const paymentWithTransaction =
      await this.transferRepository.findPaymentWithTransactionByPaymentId(
        paymentId,
      );
    if (!paymentWithTransaction) {
      return undefined;
    }

    const { payment, transaction } = paymentWithTransaction;

    return buildTransferAcceptResponseFromRecords({
      payment,
      transaction,
      correlationId,
      idempotencyState,
    });
  }

  async finalizeFromProviderOutcome(
    job: TransferJob,
    outcome: ProviderSubmitOutcome,
  ): Promise<void> {
    if (outcome === ProviderSubmitOutcome.SKIPPED) {
      await this.reconcileFromPaymentState(job);
      return;
    }

    const scope = this.scopeForJob(job);
    const paymentWithTransaction =
      await this.loadPaymentWithTransactionByReference(job);
    if (!paymentWithTransaction) {
      return;
    }

    const { payment, transaction } = paymentWithTransaction;

    const response = this.buildResponseForProviderOutcome(
      outcome,
      payment,
      transaction,
      job.correlationId,
    );

    if (outcome === ProviderSubmitOutcome.PSP_UNKNOWN) {
      await this.idempotencyRepository.markPendingUncertain(
        scope,
        response as never,
      );
      return;
    }

    await this.idempotencyRepository.finalize(scope, response as never);
  }

  async reconcileFromPaymentState(job: TransferJob): Promise<void> {
    const scope = this.scopeForJob(job);
    const row = await this.idempotencyRepository.find(scope);
    if (
      !row ||
      (row.state !== IdempotencyKeyState.IN_PROGRESS &&
        row.state !== IdempotencyKeyState.PENDING_UNCERTAIN)
    ) {
      return;
    }

    const paymentWithTransaction =
      await this.loadPaymentWithTransactionByReference(job);
    if (!paymentWithTransaction) {
      return;
    }

    const { payment, transaction } = paymentWithTransaction;

    const outcome = this.deriveProviderOutcomeFromPayment(payment);
    if (outcome === ProviderSubmitOutcome.PSP_UNKNOWN) {
      const response = this.buildResponseForProviderOutcome(
        outcome,
        payment,
        transaction,
        job.correlationId,
      );
      await this.idempotencyRepository.markPendingUncertain(
        scope,
        response as never,
      );
      return;
    }

    if (outcome === ProviderPaymentDerivedOutcome.PROCESSING) {
      return;
    }

    const response = this.buildResponseForProviderOutcome(
      outcome,
      payment,
      transaction,
      job.correlationId,
    );
    await this.idempotencyRepository.finalize(scope, response as never);

    logTransfer(this.logger, TransferLogEvents.ACCEPT_ACCEPTED, {
      stage: TRANSFER_LOG_STAGE.ACCEPT,
      component: 'TransferIdempotencyService',
      operation: 'reconcileFromPaymentState',
      correlationId: job.correlationId,
      reference: job.reference,
      paymentId: job.paymentId,
      idempotencyKey: job.idempotencyKey,
      outcome: response.outcome,
    });
  }

  async finalizeFromVerification(
    paymentId: string,
    verifiedOutcome: IdempotencyVerificationOutcome,
  ): Promise<void> {
    const row = await this.idempotencyRepository.findByResourceId(
      TRANSFER_ACCEPT_OPERATION,
      paymentId,
    );
    if (
      !row ||
      (row.state !== IdempotencyKeyState.IN_PROGRESS &&
        row.state !== IdempotencyKeyState.PENDING_UNCERTAIN)
    ) {
      return;
    }

    const paymentWithTransaction =
      await this.transferRepository.findPaymentWithTransactionByPaymentId(
        paymentId,
      );
    if (!paymentWithTransaction) {
      return;
    }

    const { payment, transaction } = paymentWithTransaction;

    const scope: IdempotencyScope = {
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      operationType: row.operationType,
      key: row.key,
    };

    const storedResponse = row.response as TransferAcceptResponse | null;
    const correlationId =
      payment.correlationId ??
      storedResponse?.correlationId ??
      payment.paymentReference;

    if (verifiedOutcome === IdempotencyVerificationOutcome.UNKNOWN) {
      const response = this.buildResponseForProviderOutcome(
        ProviderSubmitOutcome.PSP_UNKNOWN,
        payment,
        transaction,
        correlationId,
      );
      await this.idempotencyRepository.markPendingUncertain(
        scope,
        response as never,
      );
      return;
    }

    const providerOutcome =
      toProviderSubmitOutcomeFromVerification(verifiedOutcome);
    const response = this.buildResponseForProviderOutcome(
      providerOutcome,
      payment,
      transaction,
      correlationId,
    );
    await this.idempotencyRepository.finalize(scope, response as never);
  }

  private loadPaymentWithTransactionByReference(
    job: Pick<TransferJob, 'reference'>,
  ): Promise<{ payment: Payment; transaction: Transaction } | undefined> {
    return this.transferRepository.findPaymentWithTransactionByReference(
      job.reference,
    );
  }

  private buildResponseForProviderOutcome(
    outcome: ResolvedProviderOutcome,
    payment: Payment,
    transaction: Transaction,
    correlationId: string,
  ): TransferAcceptResponse {
    if (outcome === ProviderSubmitOutcome.PSP_ACCEPTED) {
      return buildTransferAcceptResponse({
        outcome: TransferAcceptOutcome.PROVIDER_ACCEPTED,
        correlationId,
        reference: payment.paymentReference,
        paymentId: payment.id,
        transactionId: transaction.id,
        paymentStatus: payment.status,
        transactionStatus: transaction.status,
        provider: payment.provider,
      });
    }

    if (outcome === ProviderSubmitOutcome.PSP_REJECTED) {
      return buildTransferAcceptResponse({
        outcome: TransferAcceptOutcome.PROVIDER_REJECTED,
        correlationId,
        reference: payment.paymentReference,
        paymentId: payment.id,
        transactionId: transaction.id,
        paymentStatus: payment.status,
        transactionStatus: transaction.status,
        provider: payment.provider,
      });
    }

    if (outcome === ProviderSubmitOutcome.PSP_UNKNOWN) {
      return buildTransferAcceptResponse({
        outcome: TransferAcceptOutcome.PENDING_UNCERTAIN,
        correlationId,
        reference: payment.paymentReference,
        paymentId: payment.id,
        transactionId: transaction.id,
        paymentStatus: payment.status,
        transactionStatus: transaction.status,
        provider: payment.provider,
      });
    }

    return buildTransferAcceptResponseFromRecords({
      payment,
      transaction,
      correlationId,
      idempotencyState: IdempotencyKeyState.IN_PROGRESS,
    });
  }

  private deriveProviderOutcomeFromPayment(
    payment: Payment,
  ): ResolvedProviderOutcome {
    if (payment.processingStatus === PaymentProcessingStatus.UNKNOWN) {
      return ProviderSubmitOutcome.PSP_UNKNOWN;
    }

    if (
      payment.status === PaymentStatus.REVERSAL_PENDING ||
      payment.status === PaymentStatus.FAILED
    ) {
      return ProviderSubmitOutcome.PSP_REJECTED;
    }

    if (
      payment.processingStatus ===
        PaymentProcessingStatus.AWAITING_SETTLEMENT ||
      payment.status === PaymentStatus.COMPLETED
    ) {
      return ProviderSubmitOutcome.PSP_ACCEPTED;
    }

    if (
      payment.processingStatus ===
        PaymentProcessingStatus.READY_FOR_SUBMISSION ||
      payment.processingStatus === PaymentProcessingStatus.SUBMITTING
    ) {
      return ProviderPaymentDerivedOutcome.PROCESSING;
    }

    return ProviderPaymentDerivedOutcome.PROCESSING;
  }
}
