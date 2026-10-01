import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@/database/database.service';
import { PermanentError, TransientError } from '@/kafka/retry-with-jitter';
import { PaymentStatus } from '@/utils/database.enums';
import {
  TransferJobType,
  type TransferReverseJob,
} from '@/transfer/dto/transfer-job.schema';
import { TRANSFER_RECONCILIATION_REASON } from '@/transfer/provider-events/transfer-money.guards';
import {
  TransferRepository,
  type TransitionableSubmitStatus,
} from '@database/repository/transfer.repository';

export type RequestTransferReversalInput = {
  paymentId: string;
  transactionId: string;
  reason: string;
  fromStatuses: readonly TransitionableSubmitStatus[];
  correlationId?: string;
};

export enum TransferReversalRequestStatus {
  STARTED = 'STARTED',
  ALREADY_REVERSED = 'ALREADY_REVERSED',
  ALREADY_PENDING = 'ALREADY_PENDING',
  NOT_TRANSITIONED = 'NOT_TRANSITIONED',
}

export type RequestTransferReversalResult =
  | {
      status: TransferReversalRequestStatus.STARTED;
      job: TransferReverseJob;
    }
  | { status: TransferReversalRequestStatus.ALREADY_REVERSED }
  | {
      status: TransferReversalRequestStatus.ALREADY_PENDING;
      job: TransferReverseJob;
    }
  | { status: TransferReversalRequestStatus.NOT_TRANSITIONED };

/**
 * Owns the locked request-reversal transition and canonical reverse-job
 * construction. Does not publish Kafka, write outbox, or apply ledger entries.
 */
@Injectable()
export class TransferReversalCoordinator {
  constructor(
    private readonly db: DatabaseService,
    private readonly transferRepository: TransferRepository,
  ) {}

  async request(
    input: RequestTransferReversalInput,
  ): Promise<RequestTransferReversalResult> {
    return this.db.transaction().execute(async (dbTx) => {
      const payment = await this.transferRepository.findPaymentByIdForUpdate(
        input.paymentId,
        dbTx,
      );
      if (!payment) {
        throw new TransientError(`Payment disappeared: ${input.paymentId}`);
      }

      const transaction = await this.transferRepository.findTransactionById(
        input.transactionId,
        dbTx,
      );
      if (!transaction) {
        throw new TransientError(
          `Transaction disappeared: ${input.transactionId}`,
        );
      }

      if (
        transaction.paymentId !== payment.id ||
        transaction.userId !== payment.userId ||
        transaction.reference !== payment.paymentReference
      ) {
        throw new PermanentError(
          `${TRANSFER_RECONCILIATION_REASON.PAYMENT_TRANSACTION_MISMATCH}: ${payment.paymentReference}`,
        );
      }

      if (
        payment.status === PaymentStatus.FAILED &&
        payment.reversalLedgerTransactionId
      ) {
        return { status: TransferReversalRequestStatus.ALREADY_REVERSED };
      }

      const job = this.buildReverseJob({
        paymentId: payment.id,
        transactionId: transaction.id,
        reference: payment.paymentReference,
        userId: payment.userId,
        amount: payment.amount.toString(),
        currency: payment.currency,
        reason: input.reason,
        ledgerTransactionId: transaction.ledgerTransactionId ?? undefined,
        correlationId: input.correlationId ?? payment.correlationId,
      });

      if (payment.status === PaymentStatus.REVERSAL_PENDING) {
        return {
          status: TransferReversalRequestStatus.ALREADY_PENDING,
          job,
        };
      }

      const requested = await this.transferRepository.requestReversal(
        payment.id,
        input.reason,
        [...input.fromStatuses],
        dbTx,
      );
      if (!requested) {
        return { status: TransferReversalRequestStatus.NOT_TRANSITIONED };
      }

      return {
        status: TransferReversalRequestStatus.STARTED,
        job,
      };
    });
  }

  buildReverseJob(parts: {
    paymentId: string;
    transactionId: string;
    reference: string;
    userId: string;
    amount: string;
    currency: string;
    reason: string;
    ledgerTransactionId?: string;
    correlationId: string;
  }): TransferReverseJob {
    return {
      type: TransferJobType.REVERSE,
      paymentId: parts.paymentId,
      transactionId: parts.transactionId,
      reference: parts.reference,
      userId: parts.userId,
      amount: parts.amount,
      currency: parts.currency,
      reason: parts.reason,
      ledgerTransactionId: parts.ledgerTransactionId,
      correlationId: parts.correlationId,
    };
  }
}
