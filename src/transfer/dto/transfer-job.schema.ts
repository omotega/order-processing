import { z } from 'zod';
import { PaymentProvider } from '@/utils/database.enums';

export const transferJobSchema = z.object({
  reference: z.string(),
  userId: z.string(),
  amount: z.string(),
  currency: z.string().default('NGN'),
  accountNumber: z.string(),
  bankCode: z.string(),
  idempotencyKey: z.string(),
  description: z.string().optional(),
  beneficiaryId: z.string().nullable().optional(),
  counterpartyName: z.string().optional(),
  bankName: z.string().nullable().optional(),
  createdAt: z.string(),
  correlationId: z.string(),
  paymentId: z.string(),
  transactionId: z.string(),
  ledgerTransactionId: z.string(),
  provider: z.nativeEnum(PaymentProvider),
  requestHash: z.string(),
});

export type TransferJob = z.infer<typeof transferJobSchema>;

export enum TransferJobType {
  REVERSE = 'TRANSFER_REVERSE',
}

export const transferReverseJobSchema = z.object({
  type: z.nativeEnum(TransferJobType),
  paymentId: z.string(),
  transactionId: z.string(),
  reference: z.string(),
  userId: z.string(),
  amount: z.string(),
  currency: z.string().default('NGN'),
  reason: z.string(),
  correlationId: z.string(),
  ledgerTransactionId: z.string().optional(),
});

export type TransferReverseJob = z.infer<typeof transferReverseJobSchema>;
