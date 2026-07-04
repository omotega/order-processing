import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { DbExecutor } from '../database/db-executor';
import type { NewWebhookEvent, WebhookEvent } from '../database/database.types';
import { WebhookEventStatus } from '../utils/database.enums';

@Injectable()
export class WebhookEventRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  findByIdempotencyKey(idempotencyKey: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('webhook_events')
      .selectAll()
      .where('idempotencyKey', '=', idempotencyKey)
      .executeTakeFirst();
  }

  create(data: NewWebhookEvent, trx?: DbExecutor): Promise<WebhookEvent> {
    return this.executor(trx)
      .insertInto('webhook_events')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  updateStatus(
    id: string,
    status: WebhookEventStatus,
    data?: {
      failureReason?: string | null;
      processedAt?: Date | null;
      retryCount?: number;
    },
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .updateTable('webhook_events')
      .set({
        status,
        failureReason: data?.failureReason ?? null,
        processedAt: data?.processedAt ?? null,
        retryCount: data?.retryCount,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  findByReference(externalReference: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('webhook_events')
      .selectAll()
      .where('externalReference', '=', externalReference)
      .orderBy('createdAt', 'desc')
      .execute();
  }
}
