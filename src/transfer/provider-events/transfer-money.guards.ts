export const TRANSFER_RECONCILIATION_REASON = {
  AMOUNT_MISMATCH: 'REQUIRES_RECONCILIATION_AMOUNT_MISMATCH',
  CURRENCY_MISMATCH: 'REQUIRES_RECONCILIATION_CURRENCY_MISMATCH',
  PAYMENT_TRANSACTION_MISMATCH:
    'REQUIRES_RECONCILIATION_PAYMENT_TRANSACTION_MISMATCH',
  SUCCESS_AFTER_TERMINAL_STATE:
    'REQUIRES_RECONCILIATION_SUCCESS_AFTER_TERMINAL_STATE',
  SETTLEMENT_PREDICATE_LOST:
    'REQUIRES_RECONCILIATION_SETTLEMENT_PREDICATE_LOST',
} as const;

export type TransferReconciliationReason =
  (typeof TRANSFER_RECONCILIATION_REASON)[keyof typeof TRANSFER_RECONCILIATION_REASON];

export function amountsMatch(
  paymentAmount: bigint | string | number,
  candidate: bigint | string | number,
): boolean {
  return BigInt(paymentAmount) === BigInt(candidate);
}

export function currenciesMatch(
  paymentCurrency: string,
  candidate: string,
): boolean {
  return paymentCurrency.toUpperCase() === candidate.toUpperCase();
}
