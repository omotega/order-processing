import { Kysely, sql } from 'kysely';

const ENUMS: Array<{ name: string; values: string[] }> = [
  { name: 'UserRole', values: ['USER', 'ADMIN', 'SUPER_ADMIN'] },
  {
    name: 'UserStatus',
    values: ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'CLOSED'],
  },
  {
    name: 'KycStatus',
    values: ['NONE', 'PENDING', 'REJECTED', 'SUBMITTED', 'VERIFIED'],
  },
  {
    name: 'AccountType',
    values: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'],
  },
  {
    name: 'AccountSubtype',
    values: [
      'USER_WALLET',
      'PROVIDER_PREFUNDED_BALANCE',
      'OUTBOUND_SUSPENSE',
      'UNAPPLIED_SETTLEMENT',
      'FEE_REVENUE',
      'PROVIDER_FEE_EXPENSE',
    ],
  },
  { name: 'AccountRole', values: ['CONTROL', 'POSTING'] },
  { name: 'AccountStatus', values: ['ACTIVE', 'FROZEN', 'CLOSED'] },
  { name: 'ActorType', values: ['USER', 'ADMIN', 'SYSTEM'] },
  { name: 'EntryDirection', values: ['DEBIT', 'CREDIT'] },
  { name: 'LedgerTransactionStatus', values: ['COMPLETED', 'REVERSED'] },
  {
    name: 'LedgerSourceType',
    values: [
      'TRANSFER_HOLD',
      'TRANSFER_SETTLEMENT',
      'TRANSFER_REVERSAL',
      'ADJUSTMENT',
      'OTHER',
    ],
  },
  {
    name: 'PaymentMethod',
    values: ['CARD', 'BANK_TRANSFER', 'WALLET', 'CRYPTO', 'MOBILE_MONEY'],
  },
  { name: 'PaymentProvider', values: ['PAYSTACK'] },
  {
    name: 'PaymentStatus',
    values: [
      'PENDING',
      'COMPLETED',
      'FAILED',
      'CANCELLED',
      'REFUNDED',
      'UNKNOWN',
      'REVERSAL_PENDING',
    ],
  },
  {
    name: 'PaymentProcessingStatus',
    values: [
      'READY_FOR_SUBMISSION',
      'SUBMITTING',
      'AWAITING_SETTLEMENT',
      'UNKNOWN',
    ],
  },
  { name: 'TransactionDirection', values: ['INBOUND', 'OUTBOUND'] },
  {
    name: 'TransactionStatus',
    values: [
      'PENDING',
      'COMPLETED',
      'FAILED',
      'CANCELLED',
      'REVERSED',
      'INITIATED',
    ],
  },
  {
    name: 'TransactionType',
    values: [
      'DEPOSIT',
      'WITHDRAWAL',
      'TRANSFER',
      'PAYMENT',
      'REFUND',
      'FEE',
      'ADJUSTMENT',
    ],
  },
  { name: 'LimitType', values: ['SINGLE_TRANSFER', 'DAILY_TRANSFER'] },
  {
    name: 'ReconciliationStatus',
    values: ['MATCHED', 'UNMATCHED', 'DISCREPANCY'],
  },
  {
    name: 'SettlementBatchStatus',
    values: ['OPEN', 'CLOSED', 'MATCHED', 'DISCREPANCY'],
  },
  {
    name: 'WebhookEventStatus',
    values: ['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DLQ'],
  },
  { name: 'WebhookProvider', values: ['PAYSTACK'] },
  {
    name: 'IdempotencyKeyState',
    values: ['IN_PROGRESS', 'COMPLETE', 'PENDING_UNCERTAIN'],
  },
  {
    name: 'IdempotencyOperation',
    values: ['TRANSFER_ACCEPT'],
  },
  { name: 'IdempotencyScopeType', values: ['USER', 'PROVIDER'] },
  {
    name: 'InboxStatus',
    values: ['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DLQ'],
  },
  { name: 'BeneficiaryStatus', values: ['ACTIVE', 'INACTIVE', 'VERIFIED'] },
];

function pgEnum(name: string) {
  return sql.raw(`"${name}"`);
}

function enumDefault(typeName: string, value: string) {
  return sql.raw(`'${value}'::"${typeName}"`);
}

async function createEnums(db: Kysely<any>) {
  for (const { name, values } of ENUMS) {
    const list = values.map((value) => `'${value}'`).join(', ');
    await sql`CREATE TYPE ${sql.raw(`"${name}"`)} AS ENUM (${sql.raw(list)})`.execute(
      db,
    );
  }
}

async function dropEnums(db: Kysely<any>) {
  for (const { name } of [...ENUMS].reverse()) {
    await sql`DROP TYPE IF EXISTS ${sql.raw(`"${name}"`)}`.execute(db);
  }
}

export async function up(db: Kysely<any>): Promise<void> {
  await createEnums(db);

  await db.schema
    .createTable('users')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('phone', 'text')
    .addColumn('firstName', 'text', (col) => col.notNull())
    .addColumn('lastName', 'text', (col) => col.notNull())
    .addColumn('password', 'text', (col) => col.notNull())
    .addColumn('role', pgEnum('UserRole'), (col) =>
      col.notNull().defaultTo(enumDefault('UserRole', 'USER')),
    )
    .addColumn('status', pgEnum('UserStatus'), (col) =>
      col
        .notNull()
        .defaultTo(enumDefault('UserStatus', 'PENDING_VERIFICATION')),
    )
    .addColumn('kycTier', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('emailVerifiedAt', sql`timestamp(3)`)
    .addColumn('phoneVerifiedAt', sql`timestamp(3)`)
    .addColumn('passwordChangedAt', sql`timestamp(3)`)
    .addColumn('failedLoginAttempts', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('lockedUntil', sql`timestamp(3)`)
    .addColumn('lastLoginAt', sql`timestamp(3)`)
    .addColumn('deletedAt', sql`timestamp(3)`)
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('updatedAt', sql`timestamp(3)`, (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('ledger_accounts')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('code', 'text', (col) => col.notNull().unique())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('type', pgEnum('AccountType'), (col) => col.notNull())
    .addColumn('subtype', pgEnum('AccountSubtype'), (col) => col.notNull())
    .addColumn('role', pgEnum('AccountRole'), (col) =>
      col.notNull().defaultTo(enumDefault('AccountRole', 'POSTING')),
    )
    .addColumn('parentAccountId', 'text', (col) =>
      col.references('ledger_accounts.id').onDelete('restrict'),
    )
    .addColumn('provider', pgEnum('PaymentProvider'))
    .addColumn('currency', 'text', (col) => col.notNull().defaultTo('NGN'))
    .addColumn('balance', 'bigint', (col) => col.notNull().defaultTo(0))
    .addColumn('status', pgEnum('AccountStatus'), (col) =>
      col.notNull().defaultTo(enumDefault('AccountStatus', 'ACTIVE')),
    )
    .addColumn('version', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('updatedAt', sql`timestamp(3)`, (col) => col.notNull())
    .addCheckConstraint(
      'ledger_accounts_balance_nonnegative',
      sql`balance >= 0`,
    )
    .addCheckConstraint(
      'ledger_accounts_control_zero_balance',
      sql`role <> 'CONTROL' OR balance = 0`,
    )
    .addCheckConstraint(
      'ledger_accounts_not_own_parent',
      sql`"parentAccountId" IS NULL OR "parentAccountId" <> id`,
    )
    .execute();

  await db.schema
    .createIndex('ledger_accounts_type_subtype_idx')
    .on('ledger_accounts')
    .columns(['type', 'subtype'])
    .execute();

  await db.schema
    .createIndex('ledger_accounts_parent_idx')
    .on('ledger_accounts')
    .column('parentAccountId')
    .execute();

  await sql`
    CREATE UNIQUE INDEX ledger_accounts_provider_posting_uidx
    ON ledger_accounts (subtype, provider, currency)
    WHERE provider IS NOT NULL AND role = 'POSTING'
  `.execute(db);

  await db.schema
    .createTable('user_accounts')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('userId', 'text', (col) =>
      col
        .notNull()
        .unique()
        .references('users.id')
        .onUpdate('cascade')
        .onDelete('cascade'),
    )
    .addColumn('ledgerAccountId', 'text', (col) =>
      col
        .notNull()
        .unique()
        .references('ledger_accounts.id')
        .onUpdate('cascade')
        .onDelete('restrict'),
    )
    .addColumn('freezeReason', 'text')
    .addColumn('frozenAt', sql`timestamp(3)`)
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('updatedAt', sql`timestamp(3)`, (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('kyc_profiles')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('userId', 'text', (col) =>
      col
        .notNull()
        .unique()
        .references('users.id')
        .onUpdate('cascade')
        .onDelete('cascade'),
    )
    .addColumn('bvnEncrypted', 'text')
    .addColumn('bvnHash', 'text')
    .addColumn('ninEncrypted', 'text')
    .addColumn('ninHash', 'text')
    .addColumn('dateOfBirthEncrypted', 'text')
    .addColumn('addressEncrypted', 'text')
    .addColumn('state', 'text')
    .addColumn('lga', 'text')
    .addColumn('status', pgEnum('KycStatus'), (col) =>
      col.notNull().defaultTo(enumDefault('KycStatus', 'PENDING')),
    )
    .addColumn('providerReference', 'text')
    .addColumn('rejectionReason', 'text')
    .addColumn('submittedAt', sql`timestamp(3)`)
    .addColumn('verifiedAt', sql`timestamp(3)`)
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('updatedAt', sql`timestamp(3)`, (col) => col.notNull())
    .execute();

  await sql`
    CREATE UNIQUE INDEX kyc_profiles_bvnHash_uidx
      ON kyc_profiles ("bvnHash")
      WHERE "bvnHash" IS NOT NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX kyc_profiles_ninHash_uidx
      ON kyc_profiles ("ninHash")
      WHERE "ninHash" IS NOT NULL
  `.execute(db);

  await db.schema
    .createTable('kyc_verification_attempts')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('kycProfileId', 'text', (col) =>
      col
        .notNull()
        .references('kyc_profiles.id')
        .onUpdate('cascade')
        .onDelete('cascade'),
    )
    .addColumn('provider', 'text', (col) => col.notNull())
    .addColumn('providerReference', 'text')
    .addColumn('status', 'text', (col) => col.notNull())
    .addColumn('failureCode', 'text')
    .addColumn('responseMetadata', 'jsonb')
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('completedAt', sql`timestamp(3)`)
    .execute();

  await sql`
    CREATE INDEX kyc_verification_attempts_profile_created_idx
      ON kyc_verification_attempts ("kycProfileId", "createdAt" DESC)
  `.execute(db);

  await db.schema
    .createTable('beneficiaries')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('userId', 'text', (col) =>
      col
        .notNull()
        .references('users.id')
        .onUpdate('cascade')
        .onDelete('cascade'),
    )
    .addColumn('accountNumberEncrypted', 'text', (col) => col.notNull())
    .addColumn('accountNumberHash', 'text', (col) => col.notNull())
    .addColumn('accountName', 'text', (col) => col.notNull())
    .addColumn('bankCode', 'text', (col) => col.notNull())
    .addColumn('bankName', 'text')
    .addColumn('nickname', 'text')
    .addColumn('status', pgEnum('BeneficiaryStatus'), (col) =>
      col.notNull().defaultTo(enumDefault('BeneficiaryStatus', 'ACTIVE')),
    )
    .addColumn('verifiedAt', sql`timestamp(3)`)
    .addColumn('lastUsedAt', sql`timestamp(3)`)
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('updatedAt', sql`timestamp(3)`, (col) => col.notNull())
    .execute();

  await sql`
    CREATE UNIQUE INDEX beneficiaries_user_account_bank_active_uidx
      ON beneficiaries ("userId", "accountNumberHash", "bankCode")
      WHERE status <> 'INACTIVE'
  `.execute(db);

  await db.schema
    .createIndex('beneficiaries_userId_idx')
    .on('beneficiaries')
    .column('userId')
    .execute();

  await db.schema
    .createTable('ledger_transactions')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('reference', 'text', (col) => col.notNull().unique())
    .addColumn('sourceType', pgEnum('LedgerSourceType'), (col) =>
      col.notNull().defaultTo(enumDefault('LedgerSourceType', 'OTHER')),
    )
    .addColumn('sourceId', 'text')
    .addColumn('correlationId', 'text')
    .addColumn('description', 'text')
    .addColumn('status', pgEnum('LedgerTransactionStatus'), (col) =>
      col
        .notNull()
        .defaultTo(enumDefault('LedgerTransactionStatus', 'COMPLETED')),
    )
    .addColumn('reversalOfId', 'text', (col) =>
      col
        .references('ledger_transactions.id')
        .onUpdate('cascade')
        .onDelete('restrict'),
    )
    .addColumn('initiatedBy', 'text', (col) =>
      col.references('users.id').onUpdate('cascade').onDelete('set null'),
    )
    .addColumn('metadata', 'jsonb')
    .addColumn('postedAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await sql`
    CREATE UNIQUE INDEX ledger_transactions_one_reversal_uidx
      ON ledger_transactions ("reversalOfId")
      WHERE "reversalOfId" IS NOT NULL AND status = 'COMPLETED'
  `.execute(db);

  await db.schema
    .createIndex('ledger_transactions_correlationId_idx')
    .on('ledger_transactions')
    .column('correlationId')
    .execute();

  await db.schema
    .createIndex('ledger_transactions_source_idx')
    .on('ledger_transactions')
    .columns(['sourceType', 'sourceId'])
    .execute();

  await db.schema
    .createTable('ledger_entries')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('transactionId', 'text', (col) =>
      col
        .notNull()
        .references('ledger_transactions.id')
        .onUpdate('cascade')
        .onDelete('restrict'),
    )
    .addColumn('ledgerAccountId', 'text', (col) =>
      col
        .notNull()
        .references('ledger_accounts.id')
        .onUpdate('cascade')
        .onDelete('restrict'),
    )
    .addColumn('sequence', 'integer', (col) => col.notNull())
    .addColumn('direction', pgEnum('EntryDirection'), (col) => col.notNull())
    .addColumn('amount', 'bigint', (col) => col.notNull())
    .addColumn('currency', 'text', (col) => col.notNull().defaultTo('NGN'))
    .addColumn('description', 'text')
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint('ledger_entries_amount_positive', sql`amount > 0`)
    .addUniqueConstraint('ledger_entries_transaction_sequence_key', [
      'transactionId',
      'sequence',
    ])
    .execute();

  await db.schema
    .createIndex('ledger_entries_ledgerAccountId_createdAt_idx')
    .on('ledger_entries')
    .columns(['ledgerAccountId', 'createdAt'])
    .execute();

  await db.schema
    .createIndex('ledger_entries_transactionId_idx')
    .on('ledger_entries')
    .column('transactionId')
    .execute();

  await sql`
    CREATE OR REPLACE FUNCTION reject_ledger_entries_modification()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'ledger_entries table is append-only; % is not permitted.', TG_OP;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_ledger_entries_append_only
      BEFORE UPDATE OR DELETE ON ledger_entries
      FOR EACH ROW
      EXECUTE FUNCTION reject_ledger_entries_modification()
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION check_ledger_transaction_balance()
    RETURNS TRIGGER AS $$
    DECLARE
      v_currency TEXT;
      v_imbalance BIGINT;
      v_reference TEXT;
      v_detail TEXT;
    BEGIN
      SELECT
        entries.currency,
        SUM(
          CASE
            WHEN entries.direction = 'DEBIT' THEN entries.amount
            ELSE -entries.amount
          END
        )
      INTO v_currency, v_imbalance
      FROM ledger_entries AS entries
      WHERE entries."transactionId" = NEW."transactionId"
      GROUP BY entries.currency
      HAVING SUM(
        CASE
          WHEN entries.direction = 'DEBIT' THEN entries.amount
          ELSE -entries.amount
        END
      ) <> 0
      LIMIT 1;

      IF FOUND THEN
        SELECT reference
        INTO v_reference
        FROM ledger_transactions
        WHERE id = NEW."transactionId";

        v_detail := json_build_object(
          'transactionId', NEW."transactionId",
          'reference', v_reference,
          'currency', v_currency,
          'imbalance', v_imbalance::TEXT
        )::TEXT;

        RAISE EXCEPTION
          'ledger imbalance for transaction %: currency=% imbalance=%',
          NEW."transactionId",
          v_currency,
          v_imbalance
          USING
            ERRCODE = '23514',
            CONSTRAINT = 'ledger_entries_transaction_balanced',
            DETAIL = v_detail;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE CONSTRAINT TRIGGER trg_ledger_entries_balance
      AFTER INSERT ON ledger_entries
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION check_ledger_transaction_balance()
  `.execute(db);

  await db.schema
    .createTable('payments')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('userId', 'text', (col) =>
      col
        .notNull()
        .references('users.id')
        .onUpdate('cascade')
        .onDelete('cascade'),
    )
    .addColumn('beneficiaryId', 'text', (col) =>
      col
        .references('beneficiaries.id')
        .onUpdate('cascade')
        .onDelete('set null'),
    )
    .addColumn('holdLedgerTransactionId', 'text', (col) =>
      col
        .notNull()
        .references('ledger_transactions.id')
        .onUpdate('cascade')
        .onDelete('restrict'),
    )
    .addColumn('settlementLedgerTransactionId', 'text', (col) =>
      col
        .references('ledger_transactions.id')
        .onUpdate('cascade')
        .onDelete('set null'),
    )
    .addColumn('reversalLedgerTransactionId', 'text', (col) =>
      col
        .references('ledger_transactions.id')
        .onUpdate('cascade')
        .onDelete('set null'),
    )
    .addColumn('amount', 'bigint', (col) => col.notNull())
    .addColumn('feeAmount', 'bigint', (col) => col.notNull().defaultTo(0))
    .addColumn('netAmount', 'bigint', (col) => col.notNull())
    .addColumn('currency', 'text', (col) => col.notNull())
    .addColumn('paymentMethod', pgEnum('PaymentMethod'), (col) => col.notNull())
    .addColumn('provider', pgEnum('PaymentProvider'), (col) =>
      col.notNull().defaultTo(enumDefault('PaymentProvider', 'PAYSTACK')),
    )
    .addColumn('paymentReference', 'text', (col) => col.notNull().unique())
    .addColumn('externalReference', 'text')
    .addColumn('correlationId', 'text', (col) => col.notNull())
    .addColumn('status', pgEnum('PaymentStatus'), (col) =>
      col.notNull().defaultTo(enumDefault('PaymentStatus', 'PENDING')),
    )
    .addColumn('processingStatus', pgEnum('PaymentProcessingStatus'), (col) =>
      col
        .notNull()
        .defaultTo(
          enumDefault('PaymentProcessingStatus', 'READY_FOR_SUBMISSION'),
        ),
    )
    .addColumn('failureReason', 'text')
    .addColumn('requestHash', 'text', (col) => col.notNull())
    .addColumn('providerClaimedAt', sql`timestamp(3)`)
    .addColumn('nextRetryAt', sql`timestamp(3)`)
    .addColumn('retryCount', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('processedAt', sql`timestamp(3)`)
    .addColumn('metadata', 'jsonb')
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('updatedAt', sql`timestamp(3)`, (col) => col.notNull())
    .addCheckConstraint('payments_amount_positive', sql`amount > 0`)
    .addCheckConstraint('payments_feeAmount_nonnegative', sql`"feeAmount" >= 0`)
    .addCheckConstraint(
      'payments_netAmount_consistency',
      sql`"netAmount" = amount - "feeAmount"`,
    )
    .execute();

  await sql`
    CREATE UNIQUE INDEX payments_provider_externalReference_uidx
      ON payments (provider, "externalReference")
      WHERE "externalReference" IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX payments_userId_createdAt_idx
      ON payments ("userId", "createdAt" DESC)
  `.execute(db);

  await sql`
    CREATE INDEX payments_status_provider_claimed_at_idx
      ON payments (status, "providerClaimedAt")
      WHERE "externalReference" IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX payments_status_nextRetryAt_idx
      ON payments (status, "nextRetryAt")
      WHERE "nextRetryAt" IS NOT NULL
  `.execute(db);

  await db.schema
    .createTable('transactions')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('userId', 'text', (col) =>
      col
        .notNull()
        .references('users.id')
        .onUpdate('cascade')
        .onDelete('cascade'),
    )
    .addColumn('userAccountId', 'text', (col) =>
      col
        .notNull()
        .references('user_accounts.id')
        .onUpdate('cascade')
        .onDelete('restrict'),
    )
    .addColumn('paymentId', 'text', (col) =>
      col.references('payments.id').onUpdate('cascade').onDelete('set null'),
    )
    .addColumn('ledgerTransactionId', 'text', (col) =>
      col
        .notNull()
        .references('ledger_transactions.id')
        .onUpdate('cascade')
        .onDelete('restrict'),
    )
    .addColumn('userLedgerEntryId', 'text', (col) =>
      col
        .notNull()
        .references('ledger_entries.id')
        .onUpdate('cascade')
        .onDelete('restrict'),
    )
    .addColumn('type', pgEnum('TransactionType'), (col) => col.notNull())
    .addColumn('direction', pgEnum('TransactionDirection'), (col) =>
      col.notNull(),
    )
    .addColumn('status', pgEnum('TransactionStatus'), (col) =>
      col.notNull().defaultTo(enumDefault('TransactionStatus', 'PENDING')),
    )
    .addColumn('amount', 'bigint', (col) => col.notNull())
    .addColumn('fee', 'bigint', (col) => col.notNull().defaultTo(0))
    .addColumn('currency', 'text', (col) => col.notNull())
    .addColumn('reference', 'text', (col) => col.notNull().unique())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('counterpartyAccount', 'text')
    .addColumn('counterpartyName', 'text')
    .addColumn('metadata', 'jsonb')
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint('transactions_amount_positive', sql`amount > 0`)
    .execute();

  await sql`
    CREATE INDEX transactions_userId_createdAt_idx
      ON transactions ("userId", "createdAt" DESC)
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION reject_transactions_modification()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'transactions table is append-only; DELETE is not permitted.';
      END IF;

      IF NEW.id IS DISTINCT FROM OLD.id
         OR NEW."userId" IS DISTINCT FROM OLD."userId"
         OR NEW."userAccountId" IS DISTINCT FROM OLD."userAccountId"
         OR NEW."paymentId" IS DISTINCT FROM OLD."paymentId"
         OR NEW."ledgerTransactionId" IS DISTINCT FROM OLD."ledgerTransactionId"
         OR NEW."userLedgerEntryId" IS DISTINCT FROM OLD."userLedgerEntryId"
         OR NEW.type IS DISTINCT FROM OLD.type
         OR NEW.direction IS DISTINCT FROM OLD.direction
         OR NEW.amount IS DISTINCT FROM OLD.amount
         OR NEW.fee IS DISTINCT FROM OLD.fee
         OR NEW.currency IS DISTINCT FROM OLD.currency
         OR NEW.reference IS DISTINCT FROM OLD.reference
         OR NEW.description IS DISTINCT FROM OLD.description
         OR NEW."counterpartyAccount" IS DISTINCT FROM OLD."counterpartyAccount"
         OR NEW."counterpartyName" IS DISTINCT FROM OLD."counterpartyName"
         OR NEW.metadata IS DISTINCT FROM OLD.metadata
         OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
      THEN
        RAISE EXCEPTION 'transactions table is append-only; only status may be updated.';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_transactions_append_only
      BEFORE UPDATE OR DELETE ON transactions
      FOR EACH ROW
      EXECUTE FUNCTION reject_transactions_modification()
  `.execute(db);

  await db.schema
    .createTable('idempotency_keys')
    .addColumn('scopeType', pgEnum('IdempotencyScopeType'), (col) =>
      col.notNull(),
    )
    .addColumn('scopeId', 'text', (col) => col.notNull())
    .addColumn('operationType', pgEnum('IdempotencyOperation'), (col) =>
      col.notNull(),
    )
    .addColumn('key', 'text', (col) => col.notNull())
    .addColumn('requestHash', 'text', (col) => col.notNull())
    .addColumn('state', pgEnum('IdempotencyKeyState'), (col) => col.notNull())
    .addColumn('response', 'jsonb')
    .addColumn('resourceId', 'text')
    .addColumn('expiresAt', sql`timestamp(3)`, (col) => col.notNull())
    .addColumn('completedAt', sql`timestamp(3)`)
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addPrimaryKeyConstraint('idempotency_keys_pkey', [
      'scopeType',
      'scopeId',
      'operationType',
      'key',
    ])
    .addCheckConstraint(
      'idempotency_keys_complete_requires_response',
      sql`state <> 'COMPLETE' OR (response IS NOT NULL AND "completedAt" IS NOT NULL)`,
    )
    .execute();

  await db.schema
    .createIndex('idempotency_keys_expires_at_idx')
    .on('idempotency_keys')
    .column('expiresAt')
    .execute();

  await db.schema
    .createIndex('idempotency_keys_operation_resource_id_idx')
    .on('idempotency_keys')
    .columns(['operationType', 'resourceId'])
    .execute();

  await db.schema
    .createTable('outbox_messages')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('topic', 'text', (col) => col.notNull())
    .addColumn('key', 'text', (col) => col.notNull())
    .addColumn('aggregateType', 'text', (col) => col.notNull())
    .addColumn('aggregateId', 'text', (col) => col.notNull())
    .addColumn('schemaVersion', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('createdAt', sql`timestamptz`, (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await db.schema
    .createIndex('outbox_messages_created_at_idx')
    .on('outbox_messages')
    .column('createdAt')
    .execute();

  await sql`DROP PUBLICATION IF EXISTS order_processing_outbox_pub`.execute(db);

  await db.schema
    .createTable('inbox_messages')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('consumerId', 'text', (col) => col.notNull())
    .addColumn('eventId', 'text', (col) => col.notNull())
    .addColumn('topic', 'text', (col) => col.notNull())
    .addColumn('partition', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('offset', 'text', (col) => col.notNull().defaultTo('0'))
    .addColumn('schemaVersion', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('status', pgEnum('InboxStatus'), (col) =>
      col.notNull().defaultTo(enumDefault('InboxStatus', 'PROCESSING')),
    )
    .addColumn('retryCount', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('lastError', 'text')
    .addColumn('claimToken', 'text')
    .addColumn('lockedUntil', sql`timestamptz`)
    .addColumn('nextAttemptAt', sql`timestamptz`)
    .addColumn('processedAt', sql`timestamptz`)
    .addColumn('createdAt', sql`timestamptz`, (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updatedAt', sql`timestamptz`, (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('inbox_messages_consumerId_eventId_key', [
      'consumerId',
      'eventId',
    ])
    .execute();

  await db.schema
    .createIndex('inbox_messages_sweep_idx')
    .on('inbox_messages')
    .columns(['consumerId', 'status', 'nextAttemptAt'])
    .execute();

  await db.schema
    .createTable('webhook_events')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('provider', pgEnum('WebhookProvider'), (col) => col.notNull())
    .addColumn('eventType', 'text', (col) => col.notNull())
    .addColumn('idempotencyKey', 'text', (col) => col.notNull())
    .addColumn('paymentId', 'text', (col) =>
      col.references('payments.id').onUpdate('cascade').onDelete('set null'),
    )
    .addColumn('externalReference', 'text')
    .addColumn('rawBodyHash', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('signature', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('status', pgEnum('WebhookEventStatus'), (col) =>
      col.notNull().defaultTo(enumDefault('WebhookEventStatus', 'RECEIVED')),
    )
    .addColumn('retryCount', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('failureReason', 'text')
    .addColumn('receivedAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('processedAt', sql`timestamp(3)`)
    .addColumn('updatedAt', sql`timestamp(3)`, (col) => col.notNull())
    .addUniqueConstraint('webhook_events_provider_idempotencyKey_key', [
      'provider',
      'idempotencyKey',
    ])
    .execute();

  await db.schema
    .createIndex('webhook_events_paymentId_idx')
    .on('webhook_events')
    .column('paymentId')
    .execute();

  await db.schema
    .createTable('processed_webhooks')
    .addColumn('processorId', 'text', (col) => col.notNull())
    .addColumn('eventId', 'text', (col) => col.notNull())
    .addColumn('receivedAt', sql`timestamptz`, (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('processedAt', sql`timestamptz`)
    .addColumn('result', 'jsonb')
    .addPrimaryKeyConstraint('processed_webhooks_pkey', [
      'processorId',
      'eventId',
    ])
    .execute();

  await db.schema
    .createIndex('webhook_events_status_receivedAt_idx')
    .on('webhook_events')
    .columns(['status', 'receivedAt'])
    .execute();

  await db.schema
    .createTable('audit_logs')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('actorType', pgEnum('ActorType'), (col) => col.notNull())
    .addColumn('actorId', 'text')
    .addColumn('action', 'text', (col) => col.notNull())
    .addColumn('resourceType', 'text', (col) => col.notNull())
    .addColumn('resourceId', 'text')
    .addColumn('changes', 'jsonb')
    .addColumn('correlationId', 'text')
    .addColumn('ipAddress', 'text')
    .addColumn('userAgent', 'text')
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex('audit_logs_resource_idx')
    .on('audit_logs')
    .columns(['resourceType', 'resourceId'])
    .execute();

  await db.schema
    .createIndex('audit_logs_correlationId_idx')
    .on('audit_logs')
    .column('correlationId')
    .execute();

  await sql`
    CREATE OR REPLACE FUNCTION reject_audit_logs_modification()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'audit_logs table is append-only; % is not permitted.', TG_OP;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_audit_logs_append_only
      BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW
      EXECUTE FUNCTION reject_audit_logs_modification()
  `.execute(db);

  await db.schema
    .createTable('limit_policies')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('kycTier', 'integer', (col) => col.notNull())
    .addColumn('limitType', pgEnum('LimitType'), (col) => col.notNull())
    .addColumn('maxAmount', 'bigint', (col) => col.notNull())
    .addColumn('currency', 'text', (col) => col.notNull().defaultTo('NGN'))
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('updatedAt', sql`timestamp(3)`, (col) => col.notNull())
    .addUniqueConstraint('limit_policies_tier_type_currency_key', [
      'kycTier',
      'limitType',
      'currency',
    ])
    .execute();

  await db.schema
    .createTable('limit_usage')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('userId', 'text', (col) =>
      col
        .notNull()
        .references('users.id')
        .onUpdate('cascade')
        .onDelete('cascade'),
    )
    .addColumn('limitType', pgEnum('LimitType'), (col) => col.notNull())
    .addColumn('periodStart', sql`timestamp(3)`, (col) => col.notNull())
    .addColumn('periodEnd', sql`timestamp(3)`, (col) => col.notNull())
    .addColumn('reservedAmount', 'bigint', (col) => col.notNull().defaultTo(0))
    .addColumn('consumedAmount', 'bigint', (col) => col.notNull().defaultTo(0))
    .addColumn('currency', 'text', (col) => col.notNull().defaultTo('NGN'))
    .addColumn('version', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('updatedAt', sql`timestamp(3)`, (col) => col.notNull())
    .addUniqueConstraint('limit_usage_user_type_period_currency_key', [
      'userId',
      'limitType',
      'periodStart',
      'currency',
    ])
    .execute();

  await db.schema
    .createTable('settlement_batches')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('provider', pgEnum('PaymentProvider'), (col) => col.notNull())
    .addColumn('externalBatchId', 'text', (col) => col.notNull())
    .addColumn('batchDate', 'date', (col) => col.notNull())
    .addColumn('currency', 'text', (col) => col.notNull().defaultTo('NGN'))
    .addColumn('totalAmount', 'bigint', (col) => col.notNull())
    .addColumn('status', pgEnum('SettlementBatchStatus'), (col) =>
      col.notNull().defaultTo(enumDefault('SettlementBatchStatus', 'OPEN')),
    )
    .addColumn('closedAt', sql`timestamp(3)`)
    .addColumn('metadata', 'jsonb')
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('updatedAt', sql`timestamp(3)`, (col) => col.notNull())
    .addUniqueConstraint('settlement_batches_provider_externalBatchId_key', [
      'provider',
      'externalBatchId',
    ])
    .addCheckConstraint(
      'settlement_batches_totalAmount_nonnegative',
      sql`"totalAmount" >= 0`,
    )
    .execute();

  await db.schema
    .createTable('reconciliation_items')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('settlementBatchId', 'text', (col) =>
      col
        .notNull()
        .references('settlement_batches.id')
        .onUpdate('cascade')
        .onDelete('cascade'),
    )
    .addColumn('paymentId', 'text', (col) =>
      col.references('payments.id').onUpdate('cascade').onDelete('set null'),
    )
    .addColumn('externalReference', 'text', (col) => col.notNull())
    .addColumn('expectedAmount', 'bigint', (col) => col.notNull())
    .addColumn('actualAmount', 'bigint', (col) => col.notNull())
    .addColumn('status', pgEnum('ReconciliationStatus'), (col) =>
      col.notNull().defaultTo(enumDefault('ReconciliationStatus', 'UNMATCHED')),
    )
    .addColumn('discrepancyReason', 'text')
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn('updatedAt', sql`timestamp(3)`, (col) => col.notNull())
    .addUniqueConstraint('reconciliation_items_batch_externalReference_key', [
      'settlementBatchId',
      'externalReference',
    ])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('reconciliation_items').execute();
  await db.schema.dropTable('settlement_batches').execute();
  await db.schema.dropTable('limit_usage').execute();
  await db.schema.dropTable('limit_policies').execute();
  await db.schema.dropTable('audit_logs').execute();
  await db.schema.dropTable('processed_webhooks').execute();
  await db.schema.dropTable('webhook_events').execute();
  await db.schema.dropTable('inbox_messages').execute();
  await db.schema.dropTable('outbox_messages').execute();
  await db.schema.dropTable('idempotency_keys').execute();
  await db.schema.dropTable('transactions').execute();
  await db.schema.dropTable('payments').execute();
  await sql`
    DROP TRIGGER IF EXISTS trg_ledger_entries_balance ON ledger_entries
  `.execute(db);
  await sql`
    DROP FUNCTION IF EXISTS check_ledger_transaction_balance()
  `.execute(db);
  await db.schema.dropTable('ledger_entries').execute();
  await db.schema.dropTable('ledger_transactions').execute();
  await db.schema.dropTable('beneficiaries').execute();
  await db.schema.dropTable('kyc_verification_attempts').execute();
  await db.schema.dropTable('kyc_profiles').execute();
  await db.schema.dropTable('user_accounts').execute();
  await db.schema.dropTable('ledger_accounts').execute();
  await db.schema.dropTable('users').execute();

  await sql`DROP FUNCTION IF EXISTS reject_ledger_entries_modification()`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS reject_transactions_modification()`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS reject_audit_logs_modification()`.execute(
    db,
  );

  await dropEnums(db);
}
