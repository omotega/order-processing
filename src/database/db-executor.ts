import type { Transaction } from 'kysely';
import type { DatabaseService } from '@/database/database.service';
import type { Database } from '@/database/database.types';

export type DbExecutor = DatabaseService | Transaction<Database>;
