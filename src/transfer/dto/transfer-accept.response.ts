import type { Payment, Transaction } from '@/database/database.types';
import {
  IdempotencyKeyState,
  PaymentProcessingStatus,
  PaymentStatus,
  TransactionStatus,
} from '@/utils/database.enums';

export enum TransferAcceptOutcome {
  PROCESSING = 'PROCESSING',
  PROVIDER_ACCEPTED = 'PROVIDER_ACCEPTED',
  PROVIDER_REJECTED = 'PROVIDER_REJECTED',
  PENDING_UNCERTAIN = 'PENDING_UNCERTAIN',
}

export type TransferAcceptResponse = {
  outcome: TransferAcceptOutcome;
  correlationId: string;
  reference: string;
  paymentId: string;
  transactionId: string;
  paymentStatus: PaymentStatus;
  transactionStatus: TransactionStatus;
  provider: string;
};

export function buildTransferAcceptResponse(input: {
  outcome: TransferAcceptOutcome;
  correlationId: string;
  reference: string;
  paymentId: string;
  transactionId: string;
  paymentStatus: PaymentStatus;
  transactionStatus: TransactionStatus;
  provider: string;
}): TransferAcceptResponse {
  return input;
}

export function deriveOutcomeFromPayment(
  payment: Pick<Payment, 'status' | 'processingStatus'>,
  idempotencyState?: IdempotencyKeyState,
): TransferAcceptOutcome {
  if (idempotencyState === IdempotencyKeyState.PENDING_UNCERTAIN) {
    if (payment.processingStatus === PaymentProcessingStatus.UNKNOWN) {
      return TransferAcceptOutcome.PENDING_UNCERTAIN;
    }
  }

  if (
    payment.processingStatus === PaymentProcessingStatus.READY_FOR_SUBMISSION ||
    payment.processingStatus === PaymentProcessingStatus.SUBMITTING
  ) {
    return TransferAcceptOutcome.PROCESSING;
  }

  if (payment.processingStatus === PaymentProcessingStatus.UNKNOWN) {
    return TransferAcceptOutcome.PENDING_UNCERTAIN;
  }

  if (
    payment.status === PaymentStatus.REVERSAL_PENDING ||
    payment.status === PaymentStatus.FAILED
  ) {
    return TransferAcceptOutcome.PROVIDER_REJECTED;
  }

  if (
    payment.processingStatus === PaymentProcessingStatus.AWAITING_SETTLEMENT ||
    payment.status === PaymentStatus.COMPLETED
  ) {
    return TransferAcceptOutcome.PROVIDER_ACCEPTED;
  }

  return TransferAcceptOutcome.PROCESSING;
}

export function buildTransferAcceptResponseFromRecords(input: {
  payment: Payment;
  transaction: Transaction;
  correlationId: string;
  idempotencyState?: IdempotencyKeyState;
}): TransferAcceptResponse {
  return buildTransferAcceptResponse({
    outcome: deriveOutcomeFromPayment(input.payment, input.idempotencyState),
    correlationId: input.correlationId,
    reference: input.payment.paymentReference,
    paymentId: input.payment.id,
    transactionId: input.transaction.id,
    paymentStatus: input.payment.status,
    transactionStatus: input.transaction.status,
    provider: input.payment.provider,
  });
}
