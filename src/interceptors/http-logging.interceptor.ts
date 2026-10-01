import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    const userId =
      typeof request.user === 'object' &&
      request.user !== null &&
      'id' in request.user
        ? String((request.user as { id?: unknown }).id ?? '')
        : undefined;

    this.logger.log('request_started', {
      correlationId: request.correlationId,
      method: request.method,
      path: request.originalUrl || request.url,
      ip: request.ip,
      userAgent: request.get('user-agent'),
      userId,
      timestamp: new Date().toISOString(),
    });

    return next.handle().pipe(
      tap(() => {
        this.logger.log('request_completed', {
          correlationId: request.correlationId,
          method: request.method,
          path: request.originalUrl || request.url,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
          userId,
          timestamp: new Date().toISOString(),
        });
      }),
    );
  }
}
