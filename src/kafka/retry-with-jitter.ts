// Imported from the module rather than the `common/errors` barrel so the Kafka
// layer does not pull in every domain error catalogue.
import {
  isClassifiedError,
  type ClassifiedError,
  type ErrorContext,
} from '@/common/errors/classified.error';

export const PERMANENT_ERROR_CODE = 'PERMANENT_FAILURE';
export const TRANSIENT_ERROR_CODE = 'TRANSIENT_FAILURE';

export class PermanentError extends Error implements ClassifiedError {
  readonly retryable = false as const;
  readonly code: string;
  readonly context?: ErrorContext;

  constructor(
    message: string,
    code: string = PERMANENT_ERROR_CODE,
    context?: ErrorContext,
  ) {
    super(message);
    this.name = 'PermanentError';
    this.code = code;
    this.context = context;
  }
}

export class TransientError extends Error implements ClassifiedError {
  readonly retryable = true as const;
  readonly code: string;
  readonly context?: ErrorContext;

  constructor(
    message: string,
    code: string = TRANSIENT_ERROR_CODE,
    context?: ErrorContext,
  ) {
    super(message);
    this.name = 'TransientError';
    this.code = code;
    this.context = context;
  }
}

export function fullJitterDelayMs(
  attempt: number,
  baseMs = 500,
  capMs = 5_000,
): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** (attempt - 1));
  return Math.floor(Math.random() * (ceiling + 1));
}

export function isRetryableError(error: unknown): boolean {
  if (isClassifiedError(error)) {
    return error.retryable;
  }
  // Unknown database, network, and runtime failures stay retryable so genuine
  // transient faults are never dropped.
  return true;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
