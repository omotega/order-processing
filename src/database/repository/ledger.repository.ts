import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor } from '@/database/db-executor';
import type {
  LedgerEntry,
  LedgerTransaction,
  NewLedgerEntry,
  NewLedgerTransaction,
} from '@/database/database.types';

@Injectable()
export class LedgerRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  findTransactionByReference(reference: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('ledger_transactions')
      .selectAll()
      .where('reference', '=', reference)
      .executeTakeFirst();
  }

  createTransaction(
    data: NewLedgerTransaction,
    trx?: DbExecutor,
  ): Promise<LedgerTransaction> {
    return this.executor(trx)
      .insertInto('ledger_transactions')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  createEntry(data: NewLedgerEntry, trx?: DbExecutor): Promise<LedgerEntry> {
    return this.executor(trx)
      .insertInto('ledger_entries')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  createEntries(entries: NewLedgerEntry[], trx: DbExecutor) {
    if (entries.length === 0) {
      return Promise.resolve([]);
    }

    return trx
      .insertInto('ledger_entries')
      .values(entries)
      .returningAll()
      .execute();
  }

  findEntriesByTransactionId(transactionId: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('ledger_entries')
      .selectAll()
      .where('transactionId', '=', transactionId)
      .execute();
  }
}
