export const WEBHOOK_ERRORS = {
  MISSING_SIGNATURE: 'Missing webhook signature',
  INVALID_SIGNATURE: 'Invalid webhook signature',
  IDENTITY_CONFLICT: 'Webhook idempotency key reused with a different payload',
} as const;
