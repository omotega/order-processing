import { Injectable } from '@nestjs/common';
import { TransferRepository } from '@database/repository/transfer.repository';
import { TransferSettlementService } from '@/transfer/settlement/transfer-settlement.service';
import {
  TransferSettlementResult,
  TransferSettlementSource,
} from '@/transfer/settlement/transfer-settlement.constants';
import {
  TransferReversalCoordinator,
  TransferReversalRequestStatus,
} from '@/transfer/reversal/transfer-reversal-coordinator.service';
import { TransferReverseService } from '@/transfer/reversal/transfer-reverse.service';
import { TRANSFER_REVERSAL_ALLOWED_STATUSES } from '@/transfer/reversal/transfer-reversal.constants';
import {
  amountsMatch,
  currenciesMatch,
  TRANSFER_RECONCILIATION_REASON,
} from '@/transfer/provider-events/transfer-money.guards';
import { isClassifiedError } from '@/common/errors/classified.error';
import type { DbExecutor } from '@/database/db-executor';
import { PaymentStatus } from '@/utils/database.enums';
import type { TransferProviderEventResult } from '@/transfer/provider-events/transfer-provider-event.result';

export type TransferProviderSuccessInput = {
  reference: string;
  amount: number;
  currency: string;
  correlationId?: string;
};

export type TransferProviderFailureInput = {
  reference: string;
  event: string;
  reason: string;
  correlationId?: string;
};

@Injectable()
export class TransferProviderEventService {
  constructor(
    private readonly transferRepository: TransferRepository,
    private readonly transferSettlementService: TransferSettlementService,
    private readonly reversalCoordinator: TransferReversalCoordinator,
    private readonly reverseService: TransferReverseService,
  ) {}

  findForWebhookAcceptance(reference: string, dbTx: DbExecutor) {
    return Promise.all([
      this.transferRepository.findPaymentByReference(reference, dbTx),
      this.transferRepository.findByReference(reference, dbTx),
    ]).then(([payment, transaction]) => ({ payment, transaction }));
  }

  async applySuccess(
    input: TransferProviderSuccessInput,
  ): Promise<TransferProviderEventResult> {
    const context =
      await this.transferRepository.findPaymentWithTransactionByReference(
        input.reference,
      );
    if (!context) {
      return {
        kind: 'NOT_FOUND',
        message: `Transaction not found for transfer success: ${input.reference}`,
      };
    }

    const { payment } = context;
    if (!currenciesMatch(payment.currency, input.currency)) {
      return {
        kind: 'CURRENCY_MISMATCH',
        expected: payment.currency,
        received: input.currency,
        message: `${TRANSFER_RECONCILIATION_REASON.CURRENCY_MISMATCH}: webhook ${input.currency} vs payment ${payment.currency}`,
      };
    }
    if (!amountsMatch(payment.amount, input.amount)) {
      return {
        kind: 'AMOUNT_MISMATCH',
        expected: BigInt(payment.amount),
        received: input.amount,
        message: `${TRANSFER_RECONCILIATION_REASON.AMOUNT_MISMATCH}: webhook ${input.amount} vs payment ${payment.amount}`,
      };
    }

    try {
      const result = await this.transferSettlementService.settle({
        paymentId: payment.id,
        reference: input.reference,
        correlationId: input.correlationId,
        source: TransferSettlementSource.WEBHOOK,
      });
      return result === TransferSettlementResult.APPLIED
        ? { kind: 'APPLIED', paymentId: payment.id }
        : { kind: 'ALREADY_APPLIED', paymentId: payment.id };
    } catch (error) {
      return this.fromClassifiedOrRethrow(error);
    }
  }

  async applyFailureOrReversal(
    input: TransferProviderFailureInput,
  ): Promise<TransferProviderEventResult> {
    const context =
      await this.transferRepository.findPaymentWithTransactionByReference(
        input.reference,
      );
    if (!context) {
      return {
        kind: 'NOT_FOUND',
        message: `Transaction not found for ${input.event}: ${input.reference}`,
      };
    }

    const { payment, transaction } = context;

    if (payment.status === PaymentStatus.COMPLETED) {
      return {
        kind: 'REQUIRES_RECONCILIATION',
        reason: `REQUIRES_RECONCILIATION: ${input.event} after COMPLETED for ${input.reference}`,
      };
    }

    if (
      payment.status === PaymentStatus.FAILED &&
      payment.reversalLedgerTransactionId
    ) {
      return { kind: 'ALREADY_APPLIED' };
    }

    let reversal: Awaited<ReturnType<TransferReversalCoordinator['request']>>;
    try {
      reversal = await this.reversalCoordinator.request({
        paymentId: payment.id,
        transactionId: transaction.id,
        reason: input.reason,
        fromStatuses: TRANSFER_REVERSAL_ALLOWED_STATUSES.WEBHOOK_REJECTED,
        correlationId: input.correlationId,
      });
    } catch (error) {
      return this.fromClassifiedOrRethrow(error);
    }

    if (reversal.status === TransferReversalRequestStatus.ALREADY_REVERSED) {
      return { kind: 'ALREADY_APPLIED' };
    }

    if (reversal.status === TransferReversalRequestStatus.NOT_TRANSITIONED) {
      const latest = await this.transferRepository.findPaymentById(payment.id);
      if (latest?.status === PaymentStatus.COMPLETED) {
        return {
          kind: 'REQUIRES_RECONCILIATION',
          reason: `REQUIRES_RECONCILIATION: ${input.event} after COMPLETED for ${input.reference}`,
        };
      }
      return {
        kind: 'REQUIRES_RECONCILIATION',
        reason: `REQUIRES_RECONCILIATION: reversal not allowed for ${input.reference}`,
      };
    }

    try {
      await this.reverseService.processReverseJob(reversal.job);
    } catch (error) {
      return this.fromClassifiedOrRethrow(error);
    }
    return { kind: 'APPLIED' };
  }

  private fromClassifiedOrRethrow(error: unknown): TransferProviderEventResult {
    if (!isClassifiedError(error)) {
      throw error;
    }
    if (error.retryable) {
      return { kind: 'NOT_FOUND', message: error.message };
    }
    return { kind: 'REQUIRES_RECONCILIATION', reason: error.message };
  }
}
