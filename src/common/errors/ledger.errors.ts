export const LEDGER_ERRORS = {
  DEBITS_CREDITS_MISMATCH: 'Debits must equal credits',
  DUPLICATE_REFERENCE: 'Transaction with this reference already exists',
  ACCOUNT_NOT_FOUND: 'Account not found',
  INSUFFICIENT_BALANCE: 'Insufficient balance',
  CONCURRENT_UPDATE: 'Concurrent account update',
  CONTROL_ACCOUNT_NOT_POSTABLE:
    'Ledger postings must target posting accounts, not control accounts',
} as const;
