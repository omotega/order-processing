import type { ClassifiedError } from '@/common/errors/classified.error';
import type {
  AccountType,
  EntryDirection,
  LedgerSourceType,
} from '@/utils/database.enums';

/**
 * `signedBalanceChange` is the signed amount applied to the stored balance
 * after account type and debit/credit rules are resolved, so crediting an
 * ASSET account by 5000 yields `-5000`. Monetary values are strings because
 * this context is serialized into logs and the DLQ.
 */
export type LedgerPostingOverdraftContext = {
  ledgerAccountId: string;
  ledgerAccountCode: string;
  ledgerAccountName: string;
  ledgerAccountType: AccountType;
  ledgerEntryDirection: EntryDirection;
  currency: string;
  currentLedgerBalance: string;
  signedBalanceChange: string;
  resultingLedgerBalance: string;
  postingAmount: string;
  ledgerTransactionReference: string;
  ledgerSourceType: LedgerSourceType;
  ledgerSourceId?: string;
  correlationId?: string;
};

export const LEDGER_POSTING_WOULD_OVERDRAW_ACCOUNT =
  'LEDGER_POSTING_WOULD_OVERDRAW_ACCOUNT';

export class LedgerPostingWouldOverdrawAccountError
  extends Error
  implements ClassifiedError
{
  readonly code = LEDGER_POSTING_WOULD_OVERDRAW_ACCOUNT;
  readonly retryable = false as const;

  constructor(readonly context: LedgerPostingOverdraftContext) {
    super(
      `Posting ${context.ledgerEntryDirection} ${context.postingAmount} ` +
        `${context.currency} to ledger account ${context.ledgerAccountCode} ` +
        `(${context.ledgerAccountName}) would change its balance from ` +
        `${context.currentLedgerBalance} to ${context.resultingLedgerBalance}`,
    );
    this.name = 'LedgerPostingWouldOverdrawAccountError';
  }
}
