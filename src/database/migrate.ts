import { promises as fs } from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { Kysely, PostgresDialect, sql } from 'kysely';
// kysely 0.29 exports Migrator from this subpath; tsconfig moduleResolution cannot see package "exports".
// @ts-expect-error Migrator types are not exposed on the package root for this moduleResolution setting.
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import { Pool } from 'pg';

config();

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const db = new Kysely({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: databaseUrl }),
    }),
  });

  const command = process.argv[2];

  if (command === 'drop') {
    await sql`DROP SCHEMA public CASCADE`.execute(db);
    await sql`CREATE SCHEMA public`.execute(db);
    console.log('Dropped and recreated schema public');
    await db.destroy();
    return;
  }

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations'),
      import: async (filePath) => require(filePath),
    }),
  });

  const direction = command === 'down' ? 'down' : 'up';
  const { error, results } =
    direction === 'down'
      ? await migrator.migrateDown()
      : await migrator.migrateToLatest();

  results?.forEach((result) => {
    if (result.status === 'Success') {
      console.log(`${result.direction} ${result.migrationName} succeeded`);
    } else if (result.status === 'Error') {
      console.error(`${result.direction} ${result.migrationName} failed`);
    }
  });

  if (error) {
    console.error('Migration failed', error);
    await db.destroy();
    process.exit(1);
  }

  if (!results?.length) {
    console.log(
      direction === 'down'
        ? 'No migration to roll back.'
        : 'Already up to date.',
    );
  }

  await db.destroy();
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
