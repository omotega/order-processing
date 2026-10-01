export enum ProviderSubmitOutcome {
  PSP_ACCEPTED = 'PSP_ACCEPTED',
  PSP_REJECTED = 'PSP_REJECTED',
  PSP_UNKNOWN = 'PSP_UNKNOWN',
  SKIPPED = 'SKIPPED',
}

export enum ProviderPaymentDerivedOutcome {
  PROCESSING = 'PROCESSING',
}

export type ResolvedProviderOutcome =
  ProviderSubmitOutcome | ProviderPaymentDerivedOutcome;

export enum IdempotencyVerificationOutcome {
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  UNKNOWN = 'UNKNOWN',
}

export function toProviderSubmitOutcomeFromVerification(
  outcome: IdempotencyVerificationOutcome,
): ProviderSubmitOutcome {
  switch (outcome) {
    case IdempotencyVerificationOutcome.ACCEPTED:
      return ProviderSubmitOutcome.PSP_ACCEPTED;
    case IdempotencyVerificationOutcome.REJECTED:
      return ProviderSubmitOutcome.PSP_REJECTED;
    case IdempotencyVerificationOutcome.UNKNOWN:
      return ProviderSubmitOutcome.PSP_UNKNOWN;
  }
}
