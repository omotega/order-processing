import { Logger } from '@nestjs/common';
import {
  buildTransferLogContext,
  type TransferLogContextInput,
} from '@/transfer/observability/transfer-log.context';

export enum TransferLogSeverity {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

export type TransferLogEventDef = {
  code: string;
  message: string;
  severity: TransferLogSeverity;
};

export const TransferLogEvents = {
  ACCEPT_STARTED: {
    code: 'TRANSFER_ACCEPT_STARTED',
    message: 'Transfer request received; starting validation',
    severity: TransferLogSeverity.INFO,
  },
  ACCEPT_REJECTED: {
    code: 'TRANSFER_ACCEPT_REJECTED',
    message: 'Transfer request rejected during validation',
    severity: TransferLogSeverity.WARN,
  },
  ACCEPT_VALIDATED: {
    code: 'TRANSFER_ACCEPT_VALIDATED',
    message: 'Transfer request validated; creating hold and async job',
    severity: TransferLogSeverity.INFO,
  },
  HOLD_COMMITTED: {
    code: 'TRANSFER_HOLD_COMMITTED',
    message: 'Funds held; payment and transaction created; outbox written',
    severity: TransferLogSeverity.INFO,
  },
  OUTBOX_WRITTEN: {
    code: 'TRANSFER_OUTBOX_WRITTEN',
    message: 'Transfer async job written to outbox',
    severity: TransferLogSeverity.INFO,
  },
  ACCEPT_ACCEPTED: {
    code: 'TRANSFER_ACCEPT_ACCEPTED',
    message: 'Transfer accepted; waiting for background processing',
    severity: TransferLogSeverity.INFO,
  },
  ACCEPT_FAILED: {
    code: 'TRANSFER_ACCEPT_FAILED',
    message: 'Transfer request failed unexpectedly before accept',
    severity: TransferLogSeverity.ERROR,
  },
  HOLD_TRANSACTION_ROLLED_BACK: {
    code: 'TRANSFER_HOLD_TRANSACTION_ROLLED_BACK',
    message: 'Accept transaction rolled back; no funds held',
    severity: TransferLogSeverity.ERROR,
  },
  INBOX_RECEIVED: {
    code: 'TRANSFER_INBOX_RECEIVED',
    message: 'Transfer job received from queue',
    severity: TransferLogSeverity.INFO,
  },
  INBOX_SKIPPED: {
    code: 'TRANSFER_INBOX_SKIPPED',
    message: 'Transfer job was not claimed; skipping this delivery',
    severity: TransferLogSeverity.INFO,
  },
  INBOX_RUN_FINISHED: {
    code: 'TRANSFER_INBOX_RUN_FINISHED',
    message: 'Transfer inbox claim finished',
    severity: TransferLogSeverity.INFO,
  },
  INBOX_PROCESSING: {
    code: 'TRANSFER_INBOX_PROCESSING',
    message: 'Transfer job marked processing in inbox',
    severity: TransferLogSeverity.INFO,
  },
  INBOX_COMPLETED: {
    code: 'TRANSFER_INBOX_COMPLETED',
    message: 'Worker finished processing transfer job',
    severity: TransferLogSeverity.INFO,
  },
  INBOX_FAILED: {
    code: 'TRANSFER_INBOX_FAILED',
    message: 'Transfer job failed in worker after retries',
    severity: TransferLogSeverity.ERROR,
  },
  CONSUMER_RETRY: {
    code: 'TRANSFER_CONSUMER_RETRY',
    message: 'Transfer processing attempt failed; retrying',
    severity: TransferLogSeverity.WARN,
  },
  CONSUMER_EXHAUSTED: {
    code: 'TRANSFER_CONSUMER_EXHAUSTED',
    message: 'Transfer processing failed after all retries',
    severity: TransferLogSeverity.ERROR,
  },
  CONSUMER_EMPTY_MESSAGE: {
    code: 'TRANSFER_CONSUMER_EMPTY_MESSAGE',
    message: 'Ignored empty transfer queue message',
    severity: TransferLogSeverity.WARN,
  },
  CONSUMER_INVALID_MESSAGE: {
    code: 'TRANSFER_CONSUMER_INVALID_MESSAGE',
    message: 'Ignored invalid transfer queue message',
    severity: TransferLogSeverity.ERROR,
  },
  PROCESSING_STARTED: {
    code: 'TRANSFER_PROCESSING_STARTED',
    message: 'Background transfer processing started',
    severity: TransferLogSeverity.INFO,
  },
  PAYMENT_CLAIMED: {
    code: 'TRANSFER_PAYMENT_CLAIMED',
    message: 'Payment claimed for provider submit',
    severity: TransferLogSeverity.INFO,
  },
  PAYMENT_CLAIM_SKIPPED: {
    code: 'TRANSFER_PAYMENT_CLAIM_SKIPPED',
    message: 'Payment not claimable; skipping provider submit',
    severity: TransferLogSeverity.INFO,
  },
  AWAITING_PROVIDER_VERIFICATION: {
    code: 'TRANSFER_AWAITING_PROVIDER_VERIFICATION',
    message:
      'Transfer awaiting provider verification; skipping automatic resubmit',
    severity: TransferLogSeverity.WARN,
  },
  PROVIDER_SUBMIT_STARTED: {
    code: 'TRANSFER_PROVIDER_SUBMIT_STARTED',
    message: 'Calling payment provider to initiate transfer',
    severity: TransferLogSeverity.INFO,
  },
  PROVIDER_ACCEPTED: {
    code: 'TRANSFER_PROVIDER_ACCEPTED',
    message: 'Payment provider accepted transfer; awaiting settlement webhook',
    severity: TransferLogSeverity.INFO,
  },
  PROVIDER_REJECTED: {
    code: 'TRANSFER_PROVIDER_REJECTED',
    message:
      'Payment provider rejected transfer; reversal pending (funds still held)',
    severity: TransferLogSeverity.WARN,
  },
  PROVIDER_OUTCOME_UNKNOWN: {
    code: 'TRANSFER_PROVIDER_OUTCOME_UNKNOWN',
    message:
      'Provider outcome uncertain; funds remain held pending verification — not reversing',
    severity: TransferLogSeverity.ERROR,
  },
  REVERSAL_STARTED: {
    code: 'TRANSFER_REVERSAL_STARTED',
    message: 'Starting ledger reverse of held funds',
    severity: TransferLogSeverity.WARN,
  },
  REVERSAL_COMPLETED: {
    code: 'TRANSFER_REVERSAL_COMPLETED',
    message: 'Held funds returned; payment and transaction marked failed',
    severity: TransferLogSeverity.WARN,
  },
  REVERSAL_FAILED: {
    code: 'TRANSFER_REVERSAL_FAILED',
    message: 'Ledger reverse failed; funds remain held — needs reconcile',
    severity: TransferLogSeverity.CRITICAL,
  },
  VERIFY_STARTED: {
    code: 'TRANSFER_VERIFY_STARTED',
    message: 'Verifying uncertain provider outcome',
    severity: TransferLogSeverity.INFO,
  },
  VERIFY_RESOLVED_ACCEPTED: {
    code: 'TRANSFER_VERIFY_RESOLVED_ACCEPTED',
    message: 'Verification found accepted transfer; awaiting settlement',
    severity: TransferLogSeverity.INFO,
  },
  VERIFY_RESOLVED_REJECTED: {
    code: 'TRANSFER_VERIFY_RESOLVED_REJECTED',
    message: 'Verification confirmed reject; enqueueing reverse',
    severity: TransferLogSeverity.WARN,
  },
  VERIFY_STILL_UNKNOWN: {
    code: 'TRANSFER_VERIFY_STILL_UNKNOWN',
    message: 'Verification still inconclusive; funds remain held',
    severity: TransferLogSeverity.ERROR,
  },
  STUCK_PAYMENT_ALERT: {
    code: 'TRANSFER_STUCK_PAYMENT_ALERT',
    message: 'Payment stuck beyond SLA in non-terminal phase',
    severity: TransferLogSeverity.CRITICAL,
  },
  SETTLEMENT_COMPLETED: {
    code: 'TRANSFER_SETTLEMENT_COMPLETED',
    message: 'Transfer settlement completed',
    severity: TransferLogSeverity.INFO,
  },
  SETTLEMENT_FAILED: {
    code: 'TRANSFER_SETTLEMENT_FAILED',
    message: 'Transfer settlement failed',
    severity: TransferLogSeverity.ERROR,
  },
} as const satisfies Record<string, TransferLogEventDef>;

export function logTransfer(
  logger: Logger,
  event: TransferLogEventDef,
  ctx: Omit<TransferLogContextInput, 'event'> &
    Pick<TransferLogContextInput, 'stage'>,
): void {
  const payload = buildTransferLogContext({
    ...ctx,
    event: event.code,
    schemaVersion: 1,
    service: 'order-processing',
    domain: 'banking',
    severity: event.severity,
  });

  if (
    event.severity === TransferLogSeverity.CRITICAL ||
    event.severity === TransferLogSeverity.ERROR
  ) {
    logger.error(event.message, payload);
  } else if (event.severity === TransferLogSeverity.WARN) {
    logger.warn(event.message, payload);
  } else {
    logger.log(event.message, payload);
  }
}
