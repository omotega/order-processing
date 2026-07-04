import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { nanoid } from 'nanoid';
import { DatabaseService } from '../database/database.service';
import { AccountRepository } from './account.repository';
import { LedgerRepository } from './ledger.repository';
import { CreateTransactionDto } from './dto';
import type { NewLedgerTransaction } from '../database/database.types';
import { AccountType, EntryDirection } from '../utils/database.enums';

function getBalanceDelta(
  accountType: AccountType,
  direction: EntryDirection,
  amount: bigint,
): bigint {
  const isDebit = direction === EntryDirection.DEBIT;

  switch (accountType) {
    case AccountType.ASSET:
    case AccountType.EXPENSE:
      return isDebit ? amount : -amount;
    case AccountType.LIABILITY:
    case AccountType.EQUITY:
    case AccountType.REVENUE:
      return isDebit ? -amount : amount;
    default:
      return isDebit ? amount : -amount;
  }
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly accountRepository: AccountRepository,
    private readonly ledgerRepository: LedgerRepository,
  ) {}

  async createTransaction(dto: CreateTransactionDto) {
    const totalDebits = dto.entries
      .filter((e) => e.direction === EntryDirection.DEBIT)
      .reduce((sum, e) => sum + e.amount, 0n);

    const totalCredits = dto.entries
      .filter((e) => e.direction === EntryDirection.CREDIT)
      .reduce((sum, e) => sum + e.amount, 0n);

    if (totalDebits !== totalCredits) {
      throw new BadRequestException(
        `Debits (${totalDebits}) must equal credits (${totalCredits})`,
      );
    }

    const existing = await this.ledgerRepository.findTransactionByReference(
      dto.reference,
    );
    if (existing) {
      throw new ConflictException(
        `Transaction with reference ${dto.reference} already exists`,
      );
    }

    return this.db.transaction().execute(async (trx) => {
      const ledgerTransaction = await this.ledgerRepository.createTransaction(
        {
          id: nanoid(),
          reference: dto.reference,
          description: dto.description ?? null,
          metadata: dto.metadata ?? null,
        } as NewLedgerTransaction,
        trx,
      );

      const entries = [];

      for (const entry of dto.entries) {
        const account = await this.accountRepository.findByIdForUpdate(
          entry.accountId,
          trx,
        );

        if (!account) {
          throw new BadRequestException(`Account ${entry.accountId} not found`);
        }

        const delta = getBalanceDelta(
          account.type as AccountType,
          entry.direction as EntryDirection,
          entry.amount,
        );
        const newBalance = BigInt(account.balance) + delta;

        if (newBalance < 0n) {
          throw new BadRequestException(
            `Insufficient balance on account ${entry.accountId}`,
          );
        }

        const updated = await this.accountRepository.updateBalance(
          account.id,
          newBalance,
          account.version,
          trx,
        );

        if (!updated) {
          throw new ConflictException(
            `Concurrent update on account ${entry.accountId}`,
          );
        }

        entries.push({
          id: nanoid(),
          transactionId: ledgerTransaction.id,
          accountId: entry.accountId,
          direction: entry.direction,
          amount: entry.amount,
          currency: entry.currency ?? account.currency,
          description: entry.description ?? null,
        });
      }

      const ledgerEntries = await this.ledgerRepository.createEntries(
        entries,
        trx,
      );

      this.logger.log('Ledger transaction created', {
        reference: dto.reference,
        entryCount: ledgerEntries.length,
      });

      return {
        transaction: ledgerTransaction,
        entries: ledgerEntries,
      };
    });
  }
}
