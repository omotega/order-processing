import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor } from '@/database/db-executor';
import type {
  NewOutboxMessage,
  OutboxMessage,
} from '@/database/database.types';

@Injectable()
export class OutboxRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  insert(data: NewOutboxMessage, trx?: DbExecutor): Promise<OutboxMessage> {
    return this.executor(trx)
      .insertInto('outbox_messages')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findByAggregate(
    aggregateType: string,
    aggregateId: string,
    trx?: DbExecutor,
  ): Promise<OutboxMessage | undefined> {
    return this.executor(trx)
      .selectFrom('outbox_messages')
      .selectAll()
      .where('aggregateType', '=', aggregateType)
      .where('aggregateId', '=', aggregateId)
      .orderBy('createdAt', 'desc')
      .executeTakeFirst();
  }
}
