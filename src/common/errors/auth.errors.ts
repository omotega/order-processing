export const AUTH_ERRORS = {
  EMAIL_ALREADY_EXISTS: 'User with this email already exists',
  INVALID_CREDENTIALS: 'Invalid credentials',
  SESSION_INVALID: 'Session is invalid or expired',
  ACCOUNT_LOCKED: 'Account is temporarily locked',
  ACCOUNT_NOT_ACTIVE: 'Account is not active',
  PIN_LOCKED: 'Transaction PIN is temporarily locked',
  PIN_NOT_SET: 'Transaction PIN is not set',
  INVALID_PIN: 'Invalid transaction PIN',
  TRANSFER_NOT_AUTHORIZED: 'Transfer is not authorized',
  PASSWORD_REQUIRED: 'Password confirmation is required',
} as const;
