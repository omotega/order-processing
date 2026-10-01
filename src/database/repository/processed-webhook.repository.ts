import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor } from '@/database/db-executor';
import type {
  JsonValue,
  NewProcessedWebhook,
  ProcessedWebhook,
} from '@/database/database.types';

export type ClaimProcessedWebhookInput = {
  processorId: string;
  eventId: string;
  result?: JsonValue | null;
};

@Injectable()
export class ProcessedWebhookRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  /**
   * Atomic claim via ON CONFLICT DO NOTHING so the TX is never aborted on
   * uniqueness races (Postgres safe).
   */
  async tryClaim(
    input: ClaimProcessedWebhookInput,
    trx?: DbExecutor,
  ): Promise<'claimed' | 'duplicate'> {
    const row = await this.executor(trx)
      .insertInto('processed_webhooks')
      .values({
        processorId: input.processorId,
        eventId: input.eventId,
        receivedAt: new Date(),
        processedAt: null,
        result: input.result ?? null,
      } as NewProcessedWebhook)
      .onConflict((oc) => oc.columns(['processorId', 'eventId']).doNothing())
      .returningAll()
      .executeTakeFirst();

    return row ? 'claimed' : 'duplicate';
  }

  find(
    processorId: string,
    eventId: string,
    trx?: DbExecutor,
  ): Promise<ProcessedWebhook | undefined> {
    return this.executor(trx)
      .selectFrom('processed_webhooks')
      .selectAll()
      .where('processorId', '=', processorId)
      .where('eventId', '=', eventId)
      .executeTakeFirst();
  }

  /**
   * Sets `processedAt` and `result` together so a row is never half-complete.
   * Returns the stored row so callers can report the persisted timestamp.
   */
  markComplete(
    processorId: string,
    eventId: string,
    result: JsonValue,
    trx?: DbExecutor,
  ): Promise<ProcessedWebhook | undefined> {
    return this.executor(trx)
      .updateTable('processed_webhooks')
      .set({
        processedAt: new Date(),
        result,
      })
      .where('processorId', '=', processorId)
      .where('eventId', '=', eventId)
      .returningAll()
      .executeTakeFirst();
  }
}
