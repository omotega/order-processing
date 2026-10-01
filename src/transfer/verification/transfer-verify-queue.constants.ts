export const TRANSFER_VERIFY_QUEUE_NAME = 'transfer-verify';

export const TRANSFER_VERIFY_JOBS = {
  SETTLEMENT_VERIFY: 'settlement-verify',
} as const;

export const SETTLEMENT_VERIFY_FAST_DELAY_MS = 5_000;
export const SETTLEMENT_VERIFY_FAST_ATTEMPTS = 12;
export const SETTLEMENT_VERIFY_MAX_ATTEMPTS = 24;

export type SettlementVerifyJob = {
  paymentId: string;
  reference: string;
  attempt: number;
  correlationId: string;
};

export type SettlementVerifyAction =
  | { action: 'SETTLED' }
  | { action: 'STOP' }
  | { action: 'REDELAY'; delayMs: number };
