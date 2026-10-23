import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`UPDATE users SET email = lower(email)`.execute(db);
  await sql`
    ALTER TABLE users
    ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email))
  `.execute(db);
  await sql`ALTER TABLE users ALTER COLUMN "firstName" DROP NOT NULL`.execute(
    db,
  );
  await sql`ALTER TABLE users ALTER COLUMN "lastName" DROP NOT NULL`.execute(
    db,
  );

  await db.schema
    .alterTable('users')
    .addColumn('transactionPinHash', 'text')
    .addColumn('pinFailedAttempts', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('pinLockedUntil', sql`timestamp(3)`)
    .execute();

  await db.schema
    .createTable('auth_sessions')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('userId', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('refreshTokenHash', 'text', (col) => col.notNull().unique())
    .addColumn('expiresAt', sql`timestamp(3)`, (col) => col.notNull())
    .addColumn('revokedAt', sql`timestamp(3)`)
    .addColumn('userAgent', 'text')
    .addColumn('createdAt', sql`timestamp(3)`, (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await sql`
    CREATE INDEX auth_sessions_user_idx ON auth_sessions ("userId")
  `.execute(db);

  await db.schema
    .alterTable('kyc_profiles')
    .dropColumn('bvnEncrypted')
    .dropColumn('ninEncrypted')
    .addColumn('bvnFingerprintKeyVersion', 'integer')
    .addColumn('bvnVerifiedAt', sql`timestamp(3)`)
    .execute();

  await sql`
    UPDATE limit_policies
    SET "maxAmount" = 0, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "kycTier" = 0
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE limit_policies
    SET "maxAmount" = CASE
      WHEN "limitType" = 'SINGLE_TRANSFER' THEN 5000000
      WHEN "limitType" = 'DAILY_TRANSFER' THEN 20000000
      ELSE "maxAmount"
    END,
    "updatedAt" = CURRENT_TIMESTAMP
    WHERE "kycTier" = 0
  `.execute(db);

  await db.schema
    .alterTable('kyc_profiles')
    .dropColumn('bvnFingerprintKeyVersion')
    .dropColumn('bvnVerifiedAt')
    .addColumn('bvnEncrypted', 'text')
    .addColumn('ninEncrypted', 'text')
    .execute();

  await db.schema.dropTable('auth_sessions').execute();

  await db.schema
    .alterTable('users')
    .dropColumn('transactionPinHash')
    .dropColumn('pinFailedAttempts')
    .dropColumn('pinLockedUntil')
    .execute();

  await sql`ALTER TABLE users DROP CONSTRAINT users_email_lowercase`.execute(
    db,
  );
  await sql`
    UPDATE users SET "firstName" = COALESCE("firstName", '')
  `.execute(db);
  await sql`
    UPDATE users SET "lastName" = COALESCE("lastName", '')
  `.execute(db);
  await sql`ALTER TABLE users ALTER COLUMN "firstName" SET NOT NULL`.execute(
    db,
  );
  await sql`ALTER TABLE users ALTER COLUMN "lastName" SET NOT NULL`.execute(
    db,
  );
}
