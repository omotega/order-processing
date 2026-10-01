export enum AccountSubtype {
  FEE_REVENUE = 'FEE_REVENUE',
  OUTBOUND_SUSPENSE = 'OUTBOUND_SUSPENSE',
  PROVIDER_FEE_EXPENSE = 'PROVIDER_FEE_EXPENSE',
  PROVIDER_PREFUNDED_BALANCE = 'PROVIDER_PREFUNDED_BALANCE',
  UNAPPLIED_SETTLEMENT = 'UNAPPLIED_SETTLEMENT',
  USER_WALLET = 'USER_WALLET',
}

export enum AccountRole {
  CONTROL = 'CONTROL',
  POSTING = 'POSTING',
}

/** Control (header) accounts. Never posted to. */
export enum ControlAccountCode {
  PROVIDER_PREFUNDED_BALANCES = '1110-000',
  CUSTOMER_DEPOSITS = '2110-000',
  OUTBOUND_SUSPENSE = '2150-000',
}

/** Standalone posting accounts with no provider dimension. */
export enum SystemAccountCode {
  UNAPPLIED_PROVIDER_SETTLEMENTS = '1190-000',
  TRANSFER_FEE_INCOME = '4110-000',
  PROVIDER_FEES_EXPENSE = '5110-000',
}

export enum AccountType {
  ASSET = 'ASSET',
  EQUITY = 'EQUITY',
  EXPENSE = 'EXPENSE',
  LIABILITY = 'LIABILITY',
  REVENUE = 'REVENUE',
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  CLOSED = 'CLOSED',
}

export enum ActorType {
  ADMIN = 'ADMIN',
  SYSTEM = 'SYSTEM',
  USER = 'USER',
}

export enum BeneficiaryStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  VERIFIED = 'VERIFIED',
}

export enum EntryDirection {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum IdempotencyKeyState {
  COMPLETE = 'COMPLETE',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_UNCERTAIN = 'PENDING_UNCERTAIN',
}

export enum IdempotencyOperation {
  TRANSFER_ACCEPT = 'TRANSFER_ACCEPT',
}

export enum IdempotencyScopeType {
  USER = 'USER',
  PROVIDER = 'PROVIDER',
}

export enum KycStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  REJECTED = 'REJECTED',
  SUBMITTED = 'SUBMITTED',
  VERIFIED = 'VERIFIED',
}

export enum LedgerSourceType {
  TRANSFER_HOLD = 'TRANSFER_HOLD',
  TRANSFER_SETTLEMENT = 'TRANSFER_SETTLEMENT',
  TRANSFER_REVERSAL = 'TRANSFER_REVERSAL',
  ADJUSTMENT = 'ADJUSTMENT',
  OTHER = 'OTHER',
}

export enum LedgerTransactionStatus {
  COMPLETED = 'COMPLETED',
  REVERSED = 'REVERSED',
}

export enum LimitType {
  DAILY_TRANSFER = 'DAILY_TRANSFER',
  SINGLE_TRANSFER = 'SINGLE_TRANSFER',
}

export enum PaymentMethod {
  BANK_TRANSFER = 'BANK_TRANSFER',
  CARD = 'CARD',
  CRYPTO = 'CRYPTO',
  MOBILE_MONEY = 'MOBILE_MONEY',
  WALLET = 'WALLET',
}

export enum PaymentProvider {
  PAYSTACK = 'PAYSTACK',
}

/** PSP payout lifecycle — explicit stored states. */
export enum PaymentStatus {
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
  REFUNDED = 'REFUNDED',
  REVERSAL_PENDING = 'REVERSAL_PENDING',
  UNKNOWN = 'UNKNOWN',
}

/** Internal async submit worker lifecycle (Kafka/orchestrator/verify). */
export enum PaymentProcessingStatus {
  READY_FOR_SUBMISSION = 'READY_FOR_SUBMISSION',
  SUBMITTING = 'SUBMITTING',
  AWAITING_SETTLEMENT = 'AWAITING_SETTLEMENT',
  UNKNOWN = 'UNKNOWN',
}

export enum ReconciliationStatus {
  DISCREPANCY = 'DISCREPANCY',
  MATCHED = 'MATCHED',
  UNMATCHED = 'UNMATCHED',
}

export enum SettlementBatchStatus {
  CLOSED = 'CLOSED',
  DISCREPANCY = 'DISCREPANCY',
  MATCHED = 'MATCHED',
  OPEN = 'OPEN',
}

export enum TransactionDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export enum TransactionStatus {
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  INITIATED = 'INITIATED',
  PENDING = 'PENDING',
  REVERSED = 'REVERSED',
}

export enum TransactionType {
  ADJUSTMENT = 'ADJUSTMENT',
  DEPOSIT = 'DEPOSIT',
  FEE = 'FEE',
  PAYMENT = 'PAYMENT',
  REFUND = 'REFUND',
  TRANSFER = 'TRANSFER',
  WITHDRAWAL = 'WITHDRAWAL',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
  USER = 'USER',
}

export enum UserStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CLOSED = 'CLOSED',
}

export enum WebhookEventStatus {
  DLQ = 'DLQ',
  FAILED = 'FAILED',
  PROCESSED = 'PROCESSED',
  PROCESSING = 'PROCESSING',
  RECEIVED = 'RECEIVED',
}

export enum WebhookProvider {
  PAYSTACK = 'PAYSTACK',
}

export enum InboxStatus {
  DLQ = 'DLQ',
  RECEIVED = 'RECEIVED',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

/** Default transfer limits per KYC tier (amounts in kobo). */
export const DEFAULT_TIER_LIMITS: Record<
  number,
  Partial<Record<LimitType, bigint>>
> = {
  0: {
    [LimitType.SINGLE_TRANSFER]: 50_000_00n,
    [LimitType.DAILY_TRANSFER]: 200_000_00n,
  },
  1: {
    [LimitType.SINGLE_TRANSFER]: 500_000_00n,
    [LimitType.DAILY_TRANSFER]: 2_000_000_00n,
  },
  2: {
    [LimitType.SINGLE_TRANSFER]: 5_000_000_00n,
    [LimitType.DAILY_TRANSFER]: 20_000_000_00n,
  },
  3: {
    [LimitType.SINGLE_TRANSFER]: 50_000_000_00n,
    [LimitType.DAILY_TRANSFER]: 100_000_000_00n,
  },
};
