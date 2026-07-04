export enum AccountSubtype {
  FEE_REVENUE = 'FEE_REVENUE',
  GATEWAY_EXPENSE = 'GATEWAY_EXPENSE',
  OPERATIONAL = 'OPERATIONAL',
  SETTLEMENT_FLOAT = 'SETTLEMENT_FLOAT',
  SETTLEMENT_SUSPENSE = 'SETTLEMENT_SUSPENSE',
  USER_WALLET = 'USER_WALLET',
}

export enum AccountType {
  ASSET = 'ASSET',
  EQUITY = 'EQUITY',
  EXPENSE = 'EXPENSE',
  LIABILITY = 'LIABILITY',
  REVENUE = 'REVENUE',
}

export enum ActorType {
  ADMIN = 'ADMIN',
  SYSTEM = 'SYSTEM',
  USER = 'USER',
}

export enum EntryDirection {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum KycStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  REJECTED = 'REJECTED',
  SUBMITTED = 'SUBMITTED',
  VERIFIED = 'VERIFIED',
}

export enum LedgerTransactionStatus {
  COMPLETED = 'COMPLETED',
  REVERSED = 'REVERSED',
}

export enum LimitType {
  DAILY_INBOUND = 'DAILY_INBOUND',
  DAILY_TRANSFER = 'DAILY_TRANSFER',
  MONTHLY_INBOUND = 'MONTHLY_INBOUND',
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
  FLUTTERWAVE = 'FLUTTERWAVE',
  PAYSTACK = 'PAYSTACK',
}

export enum PaymentStatus {
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  INITIATED = 'INITIATED',
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  REFUNDED = 'REFUNDED',
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
