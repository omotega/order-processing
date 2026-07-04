import { Injectable, Logger } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { AccountRepository } from './account.repository';
import type { DbExecutor } from '../database/db-executor';
import type { Account, NewAccount } from '../database/database.types';
import { AccountSubtype, AccountType } from '../utils/database.enums';

const BUSINESS_ACCOUNTS = [
  {
    code: '1300-000',
    name: 'Settlement Suspense',
    type: AccountType.ASSET,
    subtype: AccountSubtype.SETTLEMENT_SUSPENSE,
  },
  {
    code: '1301-000',
    name: 'Settlement Float',
    type: AccountType.ASSET,
    subtype: AccountSubtype.SETTLEMENT_FLOAT,
  },
  {
    code: '2100-000',
    name: 'Outbound Transfer Suspense',
    type: AccountType.LIABILITY,
    subtype: AccountSubtype.OPERATIONAL,
  },
  {
    code: '4100-000',
    name: 'Fee Revenue',
    type: AccountType.REVENUE,
    subtype: AccountSubtype.FEE_REVENUE,
  },
];

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(private readonly accountRepository: AccountRepository) {}

  findByUserId(userId: string, trx?: DbExecutor) {
    return this.accountRepository.findByUserId(userId, trx);
  }

  findById(id: string, trx?: DbExecutor) {
    return this.accountRepository.findById(id, trx);
  }

  findByCode(code: string, trx?: DbExecutor) {
    return this.accountRepository.findByCode(code, trx);
  }

  async createUserWallet(userId: string, trx?: DbExecutor): Promise<Account> {
    return this.accountRepository.create(
      {
        id: nanoid(),
        code: `WALLET-${userId}`,
        name: 'User Wallet',
        type: AccountType.LIABILITY,
        subtype: AccountSubtype.USER_WALLET,
        userId,
        updatedAt: new Date(),
      } as NewAccount,
      trx,
    );
  }

  async ensureBusinessAccounts(): Promise<void> {
    for (const account of BUSINESS_ACCOUNTS) {
      const existing = await this.accountRepository.findByCode(account.code);
      if (existing) {
        continue;
      }

      await this.accountRepository.create({
        id: nanoid(),
        code: account.code,
        name: account.name,
        type: account.type,
        subtype: account.subtype,
        userId: null,
        updatedAt: new Date(),
      } as NewAccount);

      this.logger.log(`Created business account: ${account.code}`);
    }
  }
}
