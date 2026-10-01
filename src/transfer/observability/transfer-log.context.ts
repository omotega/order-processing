import type { TransferSettlementResult } from '@/transfer/settlement/transfer-settlement.constants';
import { TransferSettlementSource } from '@/transfer/settlement/transfer-settlement.constants';

export { TransferSettlementSource } from '@/transfer/settlement/transfer-settlement.constants';

export const TRANSFER_LOG_STAGE = {
  ACCEPT: 'accept',
  OUTBOX: 'outbox',
  INBOX: 'inbox',
  ORCHESTRATOR: 'orchestrator',
  HOLD: 'hold',
  PROVIDER: 'provider',
  REVERSE: 'reverse',
  VERIFY: 'verify',
  SETTLE: 'settle',
} as const;

export type TransferLogStage =
  (typeof TRANSFER_LOG_STAGE)[keyof typeof TRANSFER_LOG_STAGE];

export type TransferLogContextInput = {
  event: string;
  stage: TransferLogStage;
  correlationId?: string | null;
  reference?: string | null;
  idempotencyKey?: string | null;
  userId?: string | null;
  amount?: string | number | bigint | null;
  currency?: string | null;
  bankCode?: string | null;
  accountNumber?: string | null;
  path?: 'fresh' | 'resume';
  paymentId?: string | null;
  transactionId?: string | null;
  ledgerTransactionId?: string | null;
  outboxId?: string | null;
  inboxId?: string | null;
  paymentStatus?: string | null;
  transactionStatus?: string | null;
  previousStatus?: string | null;
  nextStatus?: string | null;
  previousPaymentStatus?: string | null;
  nextPaymentStatus?: string | null;
  provider?: string | null;
  providerCode?: string | null;
  providerHttpStatus?: number | null;
  providerStep?: string | null;
  externalReference?: string | null;
  failureReason?: string | null;
  reason?: string | null;
  error?: string | null;
  errorName?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  durationMs?: number;
  attempt?: number;
  maxRetries?: number;
  retryCount?: number;
  queueAgeMs?: number;
  claimLeaseSeconds?: number;
  processingOutcome?: string | null;
  kafkaTopic?: string | null;
  kafkaPartition?: number | null;
  kafkaOffset?: string | null;
  component?: string | null;
  operation?: string | null;
  schemaVersion?: number;
  service?: string;
  domain?: string;
  severity?: string;
  source?: TransferSettlementSource;
  settlementResult?: TransferSettlementResult;
  settlementLedgerTransactionId?: string | null;
  [key: string]: unknown;
};

function accountNumberLast4(accountNumber?: string | null): string | undefined {
  if (!accountNumber) {
    return undefined;
  }
  return accountNumber.slice(-4);
}

function omitUndefined(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null),
  );
}

export function queueAgeMs(
  createdAt?: string | Date | null,
): number | undefined {
  if (!createdAt) {
    return undefined;
  }
  const t =
    createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  if (Number.isNaN(t)) {
    return undefined;
  }
  return Math.max(0, Date.now() - t);
}

export function sanitizeErrorMessage(error: unknown, maxLen = 500): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.slice(0, maxLen);
}

export function buildTransferLogContext(
  input: TransferLogContextInput,
): Record<string, unknown> {
  const { accountNumber, amount, error, failureReason, ...rest } = input;

  return omitUndefined({
    ...rest,
    amount:
      amount === undefined || amount === null ? undefined : String(amount),
    accountNumberLast4: accountNumberLast4(accountNumber),
    errorMessage:
      rest.errorMessage ??
      (error !== undefined && error !== null
        ? sanitizeErrorMessage(error)
        : undefined),
    reason: rest.reason ?? failureReason ?? undefined,
    timestamp: new Date().toISOString(),
  });
}
