import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  InternalServerErrorException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { COMMON_ERRORS, LEDGER_ERRORS } from '@/common/errors/index';
import {
  errorLogContext,
  isClassifiedError,
} from '@/common/errors/classified.error';

const LEDGER_BALANCE_CONSTRAINT = 'ledger_entries_transaction_balanced';

/**
 * Classified domain errors are mapped to HTTP responses by `code`, so the
 * filter stays independent of domain error classes. Clients receive a stable
 * generic message; the full error context is logged server-side only.
 */
const CLASSIFIED_ERROR_RESPONSES: Record<string, () => HttpException> = {
  LEDGER_POSTING_WOULD_OVERDRAW_ACCOUNT: () =>
    new UnprocessableEntityException(COMMON_ERRORS.INSUFFICIENT_BALANCE),
};

type DatabaseConstraintError = Error & {
  code?: string;
  constraint?: string;
  detail?: string;
};

type LedgerBalanceErrorDetail = {
  transactionId?: string;
  reference?: string;
  currency?: string;
  imbalance?: string;
};

function isLedgerBalanceConstraintError(
  exception: unknown,
): exception is DatabaseConstraintError {
  if (!(exception instanceof Error)) {
    return false;
  }

  const databaseError = exception as DatabaseConstraintError;
  return (
    databaseError.code === '23514' &&
    databaseError.constraint === LEDGER_BALANCE_CONSTRAINT
  );
}

function parseLedgerBalanceErrorDetail(
  detail?: string,
): LedgerBalanceErrorDetail {
  if (!detail) {
    return {};
  }

  try {
    const parsed = JSON.parse(detail) as Record<string, unknown>;
    return {
      transactionId:
        typeof parsed.transactionId === 'string'
          ? parsed.transactionId
          : undefined,
      reference:
        typeof parsed.reference === 'string' ? parsed.reference : undefined,
      currency:
        typeof parsed.currency === 'string' ? parsed.currency : undefined,
      imbalance:
        typeof parsed.imbalance === 'string' ? parsed.imbalance : undefined,
    };
  } catch {
    return {};
  }
}

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (isLedgerBalanceConstraintError(exception)) {
      this.logger.error('ledger_balance_constraint_violated', {
        correlationId: request.correlationId,
        reason: 'REQUIRES_RECONCILIATION',
        constraint: exception.constraint,
        ...parseLedgerBalanceErrorDetail(exception.detail),
        errorMessage: exception.message,
        timestamp: new Date().toISOString(),
      });
    } else if (isClassifiedError(exception)) {
      // The mapped response drops the domain context, so record it here.
      this.logger.error('classified_domain_error', {
        correlationId: request.correlationId,
        diagnostics: errorLogContext(exception),
        timestamp: new Date().toISOString(),
      });
    }

    const mappedException = this.mapException(exception);

    const status =
      mappedException instanceof HttpException
        ? mappedException.getStatus()
        : 500;
    const errorMessage =
      mappedException instanceof Error
        ? mappedException.message
        : 'Internal server error';

    const correlationId = request.correlationId;
    this.logger.error('request_failed', {
      correlationId,
      method: request.method,
      path: request.originalUrl || request.url,
      statusCode: status,
      errorName:
        mappedException instanceof Error ? mappedException.name : undefined,
      errorMessage,
      stack:
        mappedException instanceof Error ? mappedException.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    const errorResponse =
      mappedException instanceof HttpException
        ? mappedException.getResponse()
        : '';

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: errorMessage,
      error: errorResponse,
      correlationId,
    });
  }

  private mapException(exception: unknown): unknown {
    if (isLedgerBalanceConstraintError(exception)) {
      return new InternalServerErrorException(
        LEDGER_ERRORS.DEBITS_CREDITS_MISMATCH,
      );
    }

    if (isClassifiedError(exception)) {
      const buildResponse = CLASSIFIED_ERROR_RESPONSES[exception.code];
      if (buildResponse) {
        return buildResponse();
      }
    }

    return exception;
  }
}
