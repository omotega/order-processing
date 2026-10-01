import { Injectable, Logger } from '@nestjs/common';
import { newId } from '@/utils/id';
import { AccountRepository } from '@database/repository/account.repository';
import type { DbExecutor } from '@/database/db-executor';
import type {
  Account,
  NewAccount,
  NewUserAccount,
  UserAccount,
} from '@/database/database.types';
import {
  AccountRole,
  AccountStatus,
  AccountSubtype,
  AccountType,
  ControlAccountCode,
  PaymentProvider,
  SystemAccountCode,
} from '@/utils/database.enums';

type ChartEntry = {
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  role: AccountRole;
  parentCode?: string;
  provider?: PaymentProvider;
  currency?: string;
};

const CHART_OF_ACCOUNTS: ChartEntry[] = [
  {
    code: ControlAccountCode.PROVIDER_PREFUNDED_BALANCES,
    name: 'Prefunded balances at payment providers',
    type: AccountType.ASSET,
    subtype: AccountSubtype.PROVIDER_PREFUNDED_BALANCE,
    role: AccountRole.CONTROL,
  },
  {
    code: ControlAccountCode.CUSTOMER_DEPOSITS,
    name: 'Customer deposits',
    type: AccountType.LIABILITY,
    subtype: AccountSubtype.USER_WALLET,
    role: AccountRole.CONTROL,
  },
  {
    code: ControlAccountCode.OUTBOUND_SUSPENSE,
    name: 'Outbound transfers in suspense',
    type: AccountType.LIABILITY,
    subtype: AccountSubtype.OUTBOUND_SUSPENSE,
    role: AccountRole.CONTROL,
  },
  {
    code: '1110-NGN-PAYSTACK',
    name: 'Prefunded balance at Paystack NGN',
    type: AccountType.ASSET,
    subtype: AccountSubtype.PROVIDER_PREFUNDED_BALANCE,
    role: AccountRole.POSTING,
    parentCode: ControlAccountCode.PROVIDER_PREFUNDED_BALANCES,
    provider: PaymentProvider.PAYSTACK,
    currency: 'NGN',
  },
  {
    code: '2150-NGN-PAYSTACK',
    name: 'Outbound suspense Paystack NGN',
    type: AccountType.LIABILITY,
    subtype: AccountSubtype.OUTBOUND_SUSPENSE,
    role: AccountRole.POSTING,
    parentCode: ControlAccountCode.OUTBOUND_SUSPENSE,
    provider: PaymentProvider.PAYSTACK,
    currency: 'NGN',
  },
  {
    code: SystemAccountCode.UNAPPLIED_PROVIDER_SETTLEMENTS,
    name: 'Unapplied provider settlements',
    type: AccountType.ASSET,
    subtype: AccountSubtype.UNAPPLIED_SETTLEMENT,
    role: AccountRole.POSTING,
  },
  {
    code: SystemAccountCode.TRANSFER_FEE_INCOME,
    name: 'Transfer fee income',
    type: AccountType.REVENUE,
    subtype: AccountSubtype.FEE_REVENUE,
    role: AccountRole.POSTING,
  },
  {
    code: SystemAccountCode.PROVIDER_FEES_EXPENSE,
    name: 'Payment provider fees',
    type: AccountType.EXPENSE,
    subtype: AccountSubtype.PROVIDER_FEE_EXPENSE,
    role: AccountRole.POSTING,
  },
];

function toNewAccount(entry: ChartEntry, parentId: string | null): NewAccount {
  return {
    id: newId(),
    code: entry.code,
    name: entry.name,
    type: entry.type,
    subtype: entry.subtype,
    role: entry.role,
    parentAccountId: parentId,
    provider: entry.provider ?? null,
    currency: entry.currency ?? 'NGN',
    status: AccountStatus.ACTIVE,
    updatedAt: new Date(),
  } as NewAccount;
}

function assertChartMatches(
  entry: ChartEntry,
  row: Account,
  parent: Account | undefined,
): void {
  if (entry.role === AccountRole.CONTROL && entry.parentCode) {
    throw new Error(
      `Control account ${entry.code} must not have a parent of its own`,
    );
  }

  if (entry.parentCode) {
    if (!parent) {
      throw new Error(
        `Parent ${entry.parentCode} missing for chart account ${entry.code}`,
      );
    }
    if (parent.role !== AccountRole.CONTROL) {
      throw new Error(
        `Parent ${entry.parentCode} of ${entry.code} is not a control account`,
      );
    }
    if (parent.type !== entry.type) {
      throw new Error(
        `Parent ${entry.parentCode} of ${entry.code} has a different account type`,
      );
    }
    if (row.parentAccountId !== parent.id) {
      throw new Error(
        `Chart account ${entry.code} parent does not match ${entry.parentCode}`,
      );
    }
  } else if (row.parentAccountId) {
    throw new Error(`Chart account ${entry.code} must not have a parent`);
  }

  const expectedCurrency = entry.currency ?? 'NGN';
  const mismatches: string[] = [];
  if (row.role !== entry.role) mismatches.push('role');
  if (row.type !== entry.type) mismatches.push('type');
  if (row.subtype !== entry.subtype) mismatches.push('subtype');
  if (row.currency !== expectedCurrency) mismatches.push('currency');
  if ((row.provider ?? null) !== (entry.provider ?? null)) {
    mismatches.push('provider');
  }
  if (mismatches.length > 0) {
    throw new Error(
      `Chart account ${entry.code} conflicts on ${mismatches.join(', ')}`,
    );
  }
}

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(private readonly accountRepository: AccountRepository) {}

  findByUserId(userId: string, trx?: DbExecutor) {
    return this.accountRepository.findByUserId(userId, trx);
  }

  findUserAccount(userId: string, trx?: DbExecutor) {
    return this.accountRepository.findUserAccountByUserId(userId, trx);
  }

  findById(id: string, trx?: DbExecutor) {
    return this.accountRepository.findById(id, trx);
  }

  findByCode(code: string, trx?: DbExecutor) {
    return this.accountRepository.findByCode(code, trx);
  }

  findProviderPostingAccount(
    subtype:
      | AccountSubtype.PROVIDER_PREFUNDED_BALANCE
      | AccountSubtype.OUTBOUND_SUSPENSE,
    provider: PaymentProvider,
    currency: string,
    trx: DbExecutor,
    opts?: { forUpdate?: boolean },
  ) {
    return this.accountRepository.findPostingBySubtypeProviderCurrency(
      subtype,
      provider,
      currency,
      trx,
      opts,
    );
  }

  async createUserAccount(
    userId: string,
    trx?: DbExecutor,
  ): Promise<{ ledgerAccount: Account; userAccount: UserAccount }> {
    const parent = await this.accountRepository.findByCode(
      ControlAccountCode.CUSTOMER_DEPOSITS,
      trx,
    );
    if (!parent || parent.role !== AccountRole.CONTROL) {
      throw new Error(
        'Customer deposits control account missing or not a control account',
      );
    }

    const id = newId();
    const ledgerAccount = await this.accountRepository.create(
      {
        id,
        code: `WLT-${id}`,
        name: 'User Wallet',
        type: AccountType.LIABILITY,
        subtype: AccountSubtype.USER_WALLET,
        role: AccountRole.POSTING,
        parentAccountId: parent.id,
        status: AccountStatus.ACTIVE,
        updatedAt: new Date(),
      } as NewAccount,
      trx,
    );

    const userAccount = await this.accountRepository.createUserAccount(
      {
        id: newId(),
        userId,
        ledgerAccountId: ledgerAccount.id,
        freezeReason: null,
        frozenAt: null,
        updatedAt: new Date(),
      } as NewUserAccount,
      trx,
    );

    return { ledgerAccount, userAccount };
  }

  async ensureChartOfAccounts(): Promise<void> {
    const byCode = new Map<string, Account>();
    for (const entry of CHART_OF_ACCOUNTS) {
      const parent = entry.parentCode
        ? byCode.get(entry.parentCode)
        : undefined;
      await this.accountRepository.upsertIgnore(
        toNewAccount(entry, parent?.id ?? null),
      );
      const row = await this.accountRepository.findByCode(entry.code);
      if (!row) {
        throw new Error(`Chart account ${entry.code} missing after seed`);
      }
      assertChartMatches(entry, row, parent);
      byCode.set(entry.code, row);
    }
    this.logger.log('Chart of accounts verified');
  }
}
