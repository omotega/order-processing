-- Bootstrap PostgreSQL schema for order-processing (matches database.generated.ts).
-- Run: psql "$DATABASE_URL" -f scripts/bootstrap-database.sql

-- Enums
DO $$ BEGIN CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "KycStatus" AS ENUM ('NONE', 'PENDING', 'REJECTED', 'SUBMITTED', 'VERIFIED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AccountSubtype" AS ENUM ('USER_WALLET', 'FEE_REVENUE', 'SETTLEMENT_SUSPENSE', 'SETTLEMENT_FLOAT', 'GATEWAY_EXPENSE', 'OPERATIONAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ActorType" AS ENUM ('USER', 'ADMIN', 'SYSTEM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EntryDirection" AS ENUM ('DEBIT', 'CREDIT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "LedgerTransactionStatus" AS ENUM ('COMPLETED', 'REVERSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'BANK_TRANSFER', 'WALLET', 'CRYPTO', 'MOBILE_MONEY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PaymentProvider" AS ENUM ('PAYSTACK', 'FLUTTERWAVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED', 'INITIATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TransactionDirection" AS ENUM ('INBOUND', 'OUTBOUND'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED', 'INITIATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'PAYMENT', 'REFUND', 'FEE', 'ADJUSTMENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "LimitType" AS ENUM ('SINGLE_TRANSFER', 'DAILY_TRANSFER', 'DAILY_INBOUND', 'MONTHLY_INBOUND'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReconciliationStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'DISCREPANCY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SettlementBatchStatus" AS ENUM ('OPEN', 'CLOSED', 'MATCHED', 'DISCREPANCY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DLQ'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WebhookProvider" AS ENUM ('PAYSTACK'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT NOT NULL,
  email TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  pin TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  password TEXT NOT NULL,
  role "UserRole" NOT NULL DEFAULT 'USER',
  phone TEXT NOT NULL DEFAULT '',
  "deletedAt" TIMESTAMP(3),
  "emailVerifiedAt" TIMESTAMP(3),
  "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  "kycStatus" "KycStatus" NOT NULL DEFAULT 'NONE',
  "kycTier" INTEGER NOT NULL DEFAULT 0,
  "lastLoginAt" TIMESTAMP(3),
  "lockedUntil" TIMESTAMP(3),
  "phoneVerifiedAt" TIMESTAMP(3),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_email_key UNIQUE (email)
);

-- Accounts (ledger)
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type "AccountType" NOT NULL,
  subtype "AccountSubtype",
  currency TEXT NOT NULL DEFAULT 'NGN',
  balance BIGINT NOT NULL DEFAULT 0,
  "availableBalance" BIGINT NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0,
  "userId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "freezeReason" TEXT,
  "frozenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT accounts_pkey PRIMARY KEY (id),
  CONSTRAINT accounts_code_key UNIQUE (code),
  CONSTRAINT accounts_userId_fkey FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS accounts_userId_idx ON accounts ("userId");
CREATE INDEX IF NOT EXISTS accounts_type_subtype_idx ON accounts (type, subtype);

-- KYC profiles
CREATE TABLE IF NOT EXISTS kyc_profiles (
  id TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  bvn TEXT NOT NULL,
  nin TEXT NOT NULL,
  "dateOfBirth" TIMESTAMP(3) NOT NULL,
  address TEXT NOT NULL,
  state TEXT NOT NULL,
  lga TEXT NOT NULL,
  status "KycStatus" NOT NULL DEFAULT 'PENDING',
  "providerReference" TEXT NOT NULL,
  "rejectionReason" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT kyc_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT kyc_profiles_userId_key UNIQUE ("userId"),
  CONSTRAINT kyc_profiles_userId_fkey FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Beneficiaries
CREATE TABLE IF NOT EXISTS beneficiaries (
  id TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "bankCode" TEXT NOT NULL,
  "bankName" TEXT,
  nickname TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT beneficiaries_pkey PRIMARY KEY (id),
  CONSTRAINT beneficiaries_userId_fkey FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Ledger transactions
CREATE TABLE IF NOT EXISTS ledger_transactions (
  id TEXT NOT NULL,
  reference TEXT NOT NULL,
  description TEXT,
  status "LedgerTransactionStatus" NOT NULL DEFAULT 'COMPLETED',
  "initiatedBy" TEXT,
  metadata JSONB,
  "reversalOfId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ledger_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT ledger_transactions_reference_key UNIQUE (reference)
);

-- Ledger entries
CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  direction "EntryDirection" NOT NULL,
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  description TEXT,
  CONSTRAINT ledger_entries_pkey PRIMARY KEY (id),
  CONSTRAINT ledger_entries_transactionId_fkey FOREIGN KEY ("transactionId") REFERENCES ledger_transactions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT ledger_entries_accountId_fkey FOREIGN KEY ("accountId") REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "paymentReference" TEXT NOT NULL,
  status "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  provider "PaymentProvider" NOT NULL DEFAULT 'PAYSTACK',
  description TEXT,
  metadata JSONB,
  "externalReference" TEXT,
  "failureReason" TEXT,
  "feeAmount" BIGINT,
  "netAmount" BIGINT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "beneficiaryId" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_paymentReference_key UNIQUE ("paymentReference"),
  CONSTRAINT payments_userId_fkey FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT payments_beneficiaryId_fkey FOREIGN KEY ("beneficiaryId") REFERENCES beneficiaries(id) ON UPDATE CASCADE ON DELETE SET NULL
);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL,
  type "TransactionType" NOT NULL,
  status "TransactionStatus" NOT NULL DEFAULT 'PENDING',
  direction "TransactionDirection" NOT NULL,
  reference TEXT NOT NULL,
  description TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "balanceBefore" BIGINT NOT NULL,
  "balanceAfter" BIGINT NOT NULL,
  fee BIGINT,
  metadata JSONB,
  "paymentId" TEXT,
  "ledgerTransactionId" TEXT,
  "counterpartyAccount" TEXT,
  "counterpartyName" TEXT,
  reconciled BOOLEAN NOT NULL DEFAULT false,
  "reconciledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_reference_key UNIQUE (reference),
  CONSTRAINT transactions_idempotencyKey_key UNIQUE ("idempotencyKey"),
  CONSTRAINT transactions_userId_fkey FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT transactions_paymentId_fkey FOREIGN KEY ("paymentId") REFERENCES payments(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT transactions_ledgerTransactionId_fkey FOREIGN KEY ("ledgerTransactionId") REFERENCES ledger_transactions(id) ON UPDATE CASCADE ON DELETE SET NULL
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT NOT NULL,
  "actorType" "ActorType" NOT NULL,
  "actorId" TEXT,
  action TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  before JSONB,
  after JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

-- Transaction limits
CREATE TABLE IF NOT EXISTS transaction_limits (
  id TEXT NOT NULL,
  "userId" TEXT,
  "kycTier" INTEGER,
  "limitType" "LimitType" NOT NULL,
  "maxAmount" BIGINT NOT NULL,
  "currentUsage" BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT transaction_limits_pkey PRIMARY KEY (id),
  CONSTRAINT transaction_limits_userId_fkey FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Settlement batches
CREATE TABLE IF NOT EXISTS settlement_batches (
  id TEXT NOT NULL,
  provider "PaymentProvider" NOT NULL,
  "batchDate" TIMESTAMP(3) NOT NULL,
  "totalAmount" BIGINT NOT NULL,
  status "SettlementBatchStatus" NOT NULL DEFAULT 'OPEN',
  "externalBatchId" TEXT,
  metadata JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT settlement_batches_pkey PRIMARY KEY (id)
);

-- Reconciliation items
CREATE TABLE IF NOT EXISTS reconciliation_items (
  id TEXT NOT NULL,
  "settlementBatchId" TEXT NOT NULL,
  "expectedAmount" BIGINT NOT NULL,
  "actualAmount" BIGINT,
  status "ReconciliationStatus" NOT NULL DEFAULT 'UNMATCHED',
  "externalReference" TEXT,
  "discrepancyReason" TEXT,
  "paymentId" TEXT,
  "transactionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT reconciliation_items_pkey PRIMARY KEY (id),
  CONSTRAINT reconciliation_items_settlementBatchId_fkey FOREIGN KEY ("settlementBatchId") REFERENCES settlement_batches(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT reconciliation_items_paymentId_fkey FOREIGN KEY ("paymentId") REFERENCES payments(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT reconciliation_items_transactionId_fkey FOREIGN KEY ("transactionId") REFERENCES transactions(id) ON UPDATE CASCADE ON DELETE SET NULL
);

-- Webhook events
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT NOT NULL,
  provider "WebhookProvider" NOT NULL,
  "eventType" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  payload JSONB NOT NULL,
  status "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  signature TEXT,
  "externalReference" TEXT,
  "failureReason" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT webhook_events_pkey PRIMARY KEY (id),
  CONSTRAINT webhook_events_idempotencyKey_key UNIQUE ("idempotencyKey")
);

-- Append-only transactions trigger
CREATE OR REPLACE FUNCTION reject_transactions_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'transactions table is append-only; UPDATE and DELETE are not permitted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transactions_append_only ON transactions;
CREATE TRIGGER trg_transactions_append_only
  BEFORE UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION reject_transactions_modification();
