export interface ListBanksResult {
  status: boolean | string;
  data: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  message: string;
}

export interface ValidateAccountInput {
  accountNumber: string;
  bankCode: string;
}

export interface ValidateAccountResult {
  status: boolean | string;
  data: {
    bank_code: string;
    account_number: string;
    account_name: string;
  };
  message: string;
}

export interface InitiateTransferInput {
  reference: string;
  amount: bigint;
  accountNumber: string;
  bankCode: string;
  idempotencyKey: string;
  narration?: string;
  recipientName?: string;
}

export type ProviderSubmitStep = 'CREATE_RECIPIENT' | 'INITIATE_TRANSFER';

export type ProviderSubmitOutcome = 'ACCEPTED' | 'REJECTED' | 'UNKNOWN';

export interface InitiateTransferResult {
  outcome: ProviderSubmitOutcome;
  reference: string;
  externalReference?: string;
  message?: string;
  code?: string;
  httpStatus?: number;
  step?: ProviderSubmitStep;
  raw?: unknown;
}

export type VerifyTransferOutcome =
  | 'SUCCESS'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'UNKNOWN';

export interface VerifyTransferInput {
  reference: string;
  externalReference?: string;
}

export interface VerifyTransferResult {
  outcome: VerifyTransferOutcome;
  externalReference?: string;
  status?: string;
  /** Smallest currency unit (kobo for NGN), string so it stays JSON-safe. */
  amount?: string;
  currency?: string;
  message?: string;
  code?: string;
  httpStatus?: number;
  raw?: unknown;
}
