import type { Transaction } from 'kysely';
import type { DatabaseService } from './database.service';
import type { Database } from './database.types';

export type DbExecutor = DatabaseService | Transaction<Database>;
