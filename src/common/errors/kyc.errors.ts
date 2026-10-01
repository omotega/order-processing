export const KYC_ERRORS = {
  ALREADY_VERIFIED: 'KYC is already verified',
  EMAIL_VERIFICATION_REQUIRED: 'Email verification required before BVN lookup',
  PROFILE_NOT_FOUND: 'KYC profile not found',
  PROFILE_NOT_SUBMITTED: 'KYC profile is not in submitted state',
  BVN_RATE_LIMIT: 'Too many BVN lookup attempts. Try again later.',
} as const;
