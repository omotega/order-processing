import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor } from '@/database/db-executor';
import type {
  Account,
  NewAccount,
  NewUserAccount,
  UserAccount,
} from '@/database/database.types';
import {
  AccountRole,
  AccountSubtype,
  PaymentProvider,
} from '@/utils/database.enums';

@Injectable()
export class AccountRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  findByUserId(userId: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('user_accounts')
      .innerJoin(
        'ledger_accounts',
        'ledger_accounts.id',
        'user_accounts.ledgerAccountId',
      )
      .selectAll('ledger_accounts')
      .where('user_accounts.userId', '=', userId)
      .where('ledger_accounts.subtype', '=', AccountSubtype.USER_WALLET)
      .where('ledger_accounts.role', '=', AccountRole.POSTING)
      .executeTakeFirst();
  }

  findUserAccountByUserId(userId: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('user_accounts')
      .selectAll()
      .where('userId', '=', userId)
      .executeTakeFirst();
  }

  findUserAccountById(id: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('user_accounts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  findByCode(code: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('ledger_accounts')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirst();
  }

  findById(id: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('ledger_accounts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  findByIdForUpdate(id: string, trx: DbExecutor) {
    return trx
      .selectFrom('ledger_accounts')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
  }

  findByUserIdForUpdate(userId: string, trx: DbExecutor) {
    return trx
      .selectFrom('ledger_accounts')
      .innerJoin(
        'user_accounts',
        'user_accounts.ledgerAccountId',
        'ledger_accounts.id',
      )
      .selectAll('ledger_accounts')
      .where('user_accounts.userId', '=', userId)
      .where('ledger_accounts.subtype', '=', AccountSubtype.USER_WALLET)
      .where('ledger_accounts.role', '=', AccountRole.POSTING)
      .forUpdate()
      .executeTakeFirst();
  }

  findByCodeForUpdate(code: string, trx: DbExecutor) {
    return trx
      .selectFrom('ledger_accounts')
      .selectAll()
      .where('code', '=', code)
      .forUpdate()
      .executeTakeFirst();
  }

  create(data: NewAccount, trx?: DbExecutor): Promise<Account> {
    return this.executor(trx)
      .insertInto('ledger_accounts')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  createUserAccount(
    data: NewUserAccount,
    trx?: DbExecutor,
  ): Promise<UserAccount> {
    return this.executor(trx)
      .insertInto('user_accounts')
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
      .updateTable('ledger_accounts')
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

  upsertIgnore(data: NewAccount, trx?: DbExecutor): Promise<void> {
    return this.executor(trx)
      .insertInto('ledger_accounts')
      .values(data)
      .onConflict((oc) => oc.column('code').doNothing())
      .execute()
      .then(() => undefined);
  }

  findPostingBySubtypeProviderCurrency(
    subtype: AccountSubtype,
    provider: PaymentProvider,
    currency: string,
    trx: DbExecutor,
    opts?: { forUpdate?: boolean },
  ) {
    let query = trx
      .selectFrom('ledger_accounts')
      .selectAll()
      .where('subtype', '=', subtype)
      .where('provider', '=', provider)
      .where('currency', '=', currency)
      .where('role', '=', AccountRole.POSTING);

    if (opts?.forUpdate) {
      query = query.forUpdate();
    }

    return query.executeTakeFirst();
  }
}
