import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { DbExecutor } from '../database/db-executor';
import type { Account, NewAccount } from '../database/database.types';
import { AccountSubtype } from '../utils/database.enums';

@Injectable()
export class AccountRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  findByUserId(userId: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('accounts')
      .selectAll()
      .where('userId', '=', userId)
      .where('subtype', '=', AccountSubtype.USER_WALLET)
      .executeTakeFirst();
  }

  findByCode(code: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('accounts')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirst();
  }

  findById(id: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  findByIdForUpdate(id: string, trx: DbExecutor) {
    return trx
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
  }

  create(data: NewAccount, trx?: DbExecutor): Promise<Account> {
    return this.executor(trx)
      .insertInto('accounts')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  updateBalance(
    id: string,
    balance: bigint,
    expectedVersion: number,
    trx: DbExecutor,
  ) {
    return trx
      .updateTable('accounts')
      .set({
        balance,
        version: expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .where('version', '=', expectedVersion)
      .returningAll()
      .executeTakeFirst();
  }

  findBySubtype(subtype: AccountSubtype, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('accounts')
      .selectAll()
      .where('subtype', '=', subtype)
      .execute();
  }
}
