/**
 * Migrates legacy wallet balances to ledger accounts, then drops the wallets table.
 * Run: npx ts-node src/scripts/migrate-wallets-to-accounts.ts
 */
import { Pool } from 'pg';
import { nanoid } from 'nanoid';
import * as dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const walletsResult = await client.query(
      'SELECT * FROM wallets ORDER BY "createdAt"',
    );

    console.log(`Found ${walletsResult.rows.length} wallets to migrate`);

    for (const wallet of walletsResult.rows) {
      const existingAccount = await client.query(
        'SELECT id, balance FROM accounts WHERE "userId" = $1 AND subtype = $2',
        [wallet.userId, 'USER_WALLET'],
      );

      if (existingAccount.rows.length > 0) {
        const account = existingAccount.rows[0];
        const walletBalance = BigInt(wallet.balance);
        const accountBalance = BigInt(account.balance);

        if (walletBalance > accountBalance) {
          await client.query(
            'UPDATE accounts SET balance = $1, "availableBalance" = $1, "updatedAt" = NOW() WHERE id = $2',
            [walletBalance.toString(), account.id],
          );
          console.log(
            `Updated account ${account.id} balance from wallet ${wallet.id}`,
          );
        }
        continue;
      }

      await client.query(
        `INSERT INTO accounts (id, code, name, type, subtype, "userId", balance, "availableBalance", currency, version, "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, 0, true, NOW(), NOW())`,
        [
          nanoid(),
          `WALLET-${wallet.userId}`,
          'User Wallet',
          'LIABILITY',
          'USER_WALLET',
          wallet.userId,
          wallet.balance.toString(),
          wallet.currency ?? 'NGN',
        ],
      );

      console.log(`Created account for wallet user ${wallet.userId}`);
    }

    await client.query('DROP TABLE IF EXISTS wallets');
    console.log('Dropped wallets table');

    await client.query('COMMIT');
    console.log('Migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
