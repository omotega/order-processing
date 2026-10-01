import { EntryDirection, LedgerSourceType } from '@/utils/database.enums';

export interface CreateEntryDto {
  ledgerAccountId: string;
  direction: EntryDirection;
  amount: bigint;
  currency?: string;
  description?: string;
}

export interface CreateTransactionDto {
  reference: string;
  description?: string;
  entries: CreateEntryDto[];
  metadata?: Record<string, any>;
  sourceType?: LedgerSourceType;
  sourceId?: string;
  correlationId?: string;
  initiatedBy?: string;
  reversalOfId?: string;
}
