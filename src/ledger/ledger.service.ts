import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { newId } from '@/utils/id';
import { DatabaseService } from '@/database/database.service';
import { AccountRepository } from '@database/repository/account.repository';
import { LedgerRepository } from '@database/repository/ledger.repository';
import { CreateTransactionDto } from '@/ledger/dto/index';
import type { DbExecutor } from '@/database/db-executor';
import type { NewLedgerTransaction } from '@/database/database.types';
import {
  AccountType,
  EntryDirection,
  AccountRole,
  LedgerSourceType,
} from '@/utils/database.enums';
import { LEDGER_ERRORS } from '@/common/errors/index';
import { LedgerPostingWouldOverdrawAccountError } from '@/ledger/errors/index';
import { LEDGER_LOG_EVENTS } from '@/ledger/ledger-log.events';

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

  async createTransaction(dto: CreateTransactionDto, trx?: DbExecutor) {
    const totalDebits = dto.entries
      .filter((e) => e.direction === EntryDirection.DEBIT)
      .reduce((sum, e) => sum + e.amount, 0n);

    const totalCredits = dto.entries
      .filter((e) => e.direction === EntryDirection.CREDIT)
      .reduce((sum, e) => sum + e.amount, 0n);

    if (totalDebits !== totalCredits) {
      throw new BadRequestException(LEDGER_ERRORS.DEBITS_CREDITS_MISMATCH);
    }

    const existing = await this.ledgerRepository.findTransactionByReference(
      dto.reference,
      trx,
    );
    if (existing) {
      throw new ConflictException(LEDGER_ERRORS.DUPLICATE_REFERENCE);
    }

    if (trx) {
      return this.executeTransaction(dto, trx);
    }

    return this.db.transaction().execute(async (newTrx) => {
      return this.executeTransaction(dto, newTrx);
    });
  }

  private async executeTransaction(dto: CreateTransactionDto, trx: DbExecutor) {
    const ledgerTransaction = await this.ledgerRepository.createTransaction(
      {
        id: newId(),
        reference: dto.reference,
        description: dto.description ?? null,
        metadata: dto.metadata ?? null,
        sourceType: dto.sourceType ?? LedgerSourceType.OTHER,
        sourceId: dto.sourceId ?? null,
        correlationId: dto.correlationId ?? null,
        initiatedBy: dto.initiatedBy ?? null,
        reversalOfId: dto.reversalOfId ?? null,
      } as NewLedgerTransaction,
      trx,
    );

    const entries = [];
    let sequence = 1;

    for (const entry of dto.entries) {
      const account = await this.accountRepository.findByIdForUpdate(
        entry.ledgerAccountId,
        trx,
      );

      if (!account) {
        throw new BadRequestException(LEDGER_ERRORS.ACCOUNT_NOT_FOUND);
      }

      if (account.role === AccountRole.CONTROL) {
        throw new BadRequestException(
          LEDGER_ERRORS.CONTROL_ACCOUNT_NOT_POSTABLE,
        );
      }

      const delta = getBalanceDelta(
        account.type as AccountType,
        entry.direction as EntryDirection,
        entry.amount,
      );
      const newBalance = BigInt(account.balance) + delta;

      if (newBalance < 0n) {
        // Not logged here: LedgerService cannot know whether the caller is an
        // HTTP request or a Kafka consumer, nor the final handling outcome.
        throw new LedgerPostingWouldOverdrawAccountError({
          ledgerAccountId: account.id,
          ledgerAccountCode: account.code,
          ledgerAccountName: account.name,
          ledgerAccountType: account.type as AccountType,
          ledgerEntryDirection: entry.direction as EntryDirection,
          currency: entry.currency ?? account.currency,
          currentLedgerBalance: String(account.balance),
          signedBalanceChange: String(delta),
          resultingLedgerBalance: String(newBalance),
          postingAmount: String(entry.amount),
          ledgerTransactionReference: dto.reference,
          ledgerSourceType: dto.sourceType ?? LedgerSourceType.OTHER,
          ledgerSourceId: dto.sourceId ?? undefined,
          correlationId: dto.correlationId ?? undefined,
        });
      }

      const updated = await this.accountRepository.updateBalance(
        account.id,
        newBalance,
        account.version,
        trx,
      );

      if (!updated) {
        throw new ConflictException(LEDGER_ERRORS.CONCURRENT_UPDATE);
      }

      entries.push({
        id: newId(),
        transactionId: ledgerTransaction.id,
        ledgerAccountId: entry.ledgerAccountId,
        direction: entry.direction,
        amount: entry.amount,
        currency: entry.currency ?? account.currency,
        description: entry.description ?? null,
        sequence: sequence++,
      });
    }

    const ledgerEntries = await this.ledgerRepository.createEntries(
      entries,
      trx,
    );

    this.logger.log('Ledger transaction created', {
      event: LEDGER_LOG_EVENTS.TRANSACTION_CREATED,
      reference: dto.reference,
      ledgerTransactionId: ledgerTransaction.id,
      entryCount: ledgerEntries.length,
      correlationId: dto.correlationId ?? undefined,
      sourceType: dto.sourceType ?? undefined,
      sourceId: dto.sourceId ?? undefined,
    });

    return {
      transaction: ledgerTransaction,
      entries: ledgerEntries,
    };
  }
}
