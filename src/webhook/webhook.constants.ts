/** Outcome of applying a webhook job after Kafka delivery. */
export enum WebhookApplyResult {
  APPLIED = 'APPLIED',
  ALREADY_APPLIED = 'ALREADY_APPLIED',
  IGNORED_UNSUPPORTED = 'IGNORED_UNSUPPORTED',
}

/** Transfer webhook handlers that mutate payment/ledger state. */
export type TransferWebhookApplyResult =
  WebhookApplyResult.APPLIED | WebhookApplyResult.ALREADY_APPLIED;

export const WEBHOOK_LOG_EVENTS = {
  ACKNOWLEDGED: 'WEBHOOK_ACKNOWLEDGED',
  APPLY_COMPLETED: 'WEBHOOK_APPLY_COMPLETED',
  APPLY_FAILED: 'WEBHOOK_APPLY_FAILED',
} as const;

export enum WebhookAcknowledgementOutcome {
  ACCEPTED = 'ACCEPTED',
  DUPLICATE = 'DUPLICATE',
  CONFLICT = 'CONFLICT',
  IGNORED = 'IGNORED',
  UNKNOWN_REFERENCE = 'UNKNOWN_REFERENCE',
}

export enum WebhookResponseStatus {
  SUCCESS = 'success',
}

export enum WebhookFailureReason {
  PAYMENT_NOT_FOUND = 'PAYMENT_NOT_FOUND',
  TRANSACTION_NOT_FOUND = 'TRANSACTION_NOT_FOUND',
  PAYMENT_TRANSACTION_MISMATCH = 'PAYMENT_TRANSACTION_MISMATCH',
}
