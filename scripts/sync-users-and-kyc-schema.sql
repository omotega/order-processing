-- Align users table and related onboarding tables with application schema.

DO $$ BEGIN
  CREATE TYPE "KycStatus" AS ENUM (
    'NONE',
    'PENDING',
    'REJECTED',
    'SUBMITTED',
    'VERIFIED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ActorType" AS ENUM ('USER', 'ADMIN', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "kycStatus" "KycStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS "kycTier" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP(3);

UPDATE users SET phone = '' WHERE phone IS NULL;
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
ALTER TABLE users ALTER COLUMN phone SET DEFAULT '';

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS "availableBalance" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS "freezeReason" TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS "frozenAt" TIMESTAMP(3);

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
