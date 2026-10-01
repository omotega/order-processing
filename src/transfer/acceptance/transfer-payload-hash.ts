import { createHash } from 'crypto';

export type TransferPayloadHashInput = {
  userId: string;
  amount: string | number | bigint;
  currency: string;
  bankCode: string;
  accountNumber: string;
};

/** Canonical sha256 of accept-path equivalence fields. */
export function hashTransferPayload(input: TransferPayloadHashInput): string {
  const canonical = JSON.stringify({
    accountNumber: input.accountNumber,
    amount: String(input.amount),
    bankCode: input.bankCode,
    currency: input.currency,
    userId: input.userId,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
