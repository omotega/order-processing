import { EntryDirection } from '../../utils/database.enums';

export interface CreateEntryDto {
  accountId: string;
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
}
