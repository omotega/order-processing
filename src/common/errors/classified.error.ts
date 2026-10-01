/**
 * Generic error classification contract shared by every domain.
 *
 * Infrastructure boundaries (Kafka consumers, the HTTP exception filter) decide
 * retry and response behaviour from `retryable` and `code` alone, so they never
 * need to import domain error classes.
 */

/**
 * Error context is published to the DLQ and `JSON.stringify` runs over it.
 * Restricting values keeps a `bigint` amount from throwing inside the failure
 * path itself, so monetary values must be stringified at construction.
 */
export type JsonSafeValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonSafeValue[]
  | { readonly [key: string]: JsonSafeValue | undefined };

export type ErrorContext = Readonly<Record<string, JsonSafeValue | undefined>>;

export interface ClassifiedError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly context?: ErrorContext;
}

export function isClassifiedError(error: unknown): error is ClassifiedError {
  return (
    error instanceof Error &&
    typeof (error as Partial<ClassifiedError>).code === 'string' &&
    typeof (error as Partial<ClassifiedError>).retryable === 'boolean'
  );
}

/**
 * Flattens an error into structured log fields. Callers must nest the result
 * under a dedicated key rather than spreading it, so domain context can never
 * overwrite message identity fields such as `reference`.
 */
export function errorLogContext(error: unknown): Record<string, unknown> {
  if (isClassifiedError(error)) {
    return {
      ...error.context,
      errorName: error.name,
      errorCode: error.code,
      errorMessage: error.message,
      retryable: error.retryable,
    };
  }

  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }

  return { errorMessage: String(error) };
}

/** Bounded `code: message` summary for narrow text columns such as `lastError`. */
export function errorSummary(error: unknown, maxLength = 500): string {
  if (isClassifiedError(error)) {
    return `${error.code}: ${error.message}`.slice(0, maxLength);
  }

  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.slice(0, maxLength);
  }

  return String(error).slice(0, maxLength);
}
