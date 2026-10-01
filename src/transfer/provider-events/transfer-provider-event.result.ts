export type TransferProviderEventResult =
  | { kind: 'APPLIED'; paymentId?: string }
  | { kind: 'ALREADY_APPLIED'; paymentId?: string }
  | { kind: 'NOT_FOUND'; message: string }
  | {
      kind: 'AMOUNT_MISMATCH';
      expected: bigint;
      received: number;
      message: string;
    }
  | {
      kind: 'CURRENCY_MISMATCH';
      expected: string;
      received: string;
      message: string;
    }
  | { kind: 'REQUIRES_RECONCILIATION'; reason: string };
