import { Injectable } from '@nestjs/common';
import { sql, type Updateable } from 'kysely';
import { DatabaseService } from '@/database/database.service';
import type { DB } from '@/database/database.generated';
import type { InboxMessage, JsonValue } from '@/database/database.types';
import { InboxStatus } from '@/utils/database.enums';
import { KafkaConsumerId } from '@/kafka/kafka.consumers';
import { INBOX_CLAIM_LEASE_MS } from '@/kafka/kafka.constants';
import { newId } from '@/utils/id';

export type InboxIdentity = { consumerId: KafkaConsumerId; eventId: string };

export type ClaimedInbox = { message: InboxMessage; claimToken: string };

export type InboxClaim =
  | ({ outcome: 'CLAIMED' } & ClaimedInbox)
  | { outcome: 'ALREADY_PROCESSED'; message: InboxMessage }
  | { outcome: 'IN_PROGRESS'; message: InboxMessage }
  | { outcome: 'RETRY_SCHEDULED'; message: InboxMessage }
  | { outcome: 'DEAD_LETTERED'; message: InboxMessage };

type InboxMessageUpdate = Updateable<DB['inbox_messages']>;

@Injectable()
export class InboxRepository {
  constructor(private readonly db: DatabaseService) {}

  async claim(
    identity: InboxIdentity,
    input: {
      topic: string;
      payload: JsonValue;
      kafkaMeta: { partition: number; offset: string };
    },
  ): Promise<InboxClaim> {
    const claimToken = newId();
    const lockedUntil = new Date(Date.now() + INBOX_CLAIM_LEASE_MS);

    const inserted = await this.db
      .insertInto('inbox_messages')
      .values({
        id: newId(),
        ...identity,
        topic: input.topic,
        payload: input.payload,
        partition: input.kafkaMeta.partition,
        offset: input.kafkaMeta.offset,
        schemaVersion: 1,
        status: InboxStatus.PROCESSING,
        retryCount: 0,
        lastError: null,
        claimToken,
        lockedUntil,
        nextAttemptAt: null,
        processedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflict((oc) => oc.columns(['consumerId', 'eventId']).doNothing())
      .returningAll()
      .executeTakeFirst();
    if (inserted) {
      return { outcome: 'CLAIMED', message: inserted, claimToken };
    }

    const existing = await this.findByIdentity(identity);
    return this.classify(existing);
  }

  async claimDue(
    consumerId: KafkaConsumerId,
    limit: number,
  ): Promise<ClaimedInbox[]> {
    const claimToken = newId();

    const rows = await this.db
      .updateTable('inbox_messages')
      .set({
        status: InboxStatus.PROCESSING,
        claimToken,
        lockedUntil: sql<Date>`now() + ${INBOX_CLAIM_LEASE_MS} * interval '1 millisecond'`,
        retryCount: sql<number>`CASE WHEN "status" = 'PROCESSING' THEN "retryCount" + 1 ELSE "retryCount" END`,
        updatedAt: sql<Date>`now()`,
      } as unknown as InboxMessageUpdate)
      .where('id', 'in', (eb) =>
        eb
          .selectFrom('inbox_messages')
          .select('id')
          .where('consumerId', '=', consumerId)
          .where((w) =>
            w.or([
              w.and([
                w('status', '=', InboxStatus.FAILED),
                w('nextAttemptAt', '<=', sql<Date>`now()`),
              ]),
              w.and([
                w('status', '=', InboxStatus.PROCESSING),
                w('lockedUntil', '<', sql<Date>`now()`),
              ]),
            ]),
          )
          .orderBy('createdAt')
          .limit(limit)
          .forUpdate()
          .skipLocked(),
      )
      .returningAll()
      .execute();

    return rows.map((message) => ({ message, claimToken }));
  }

  async markCompleted(claim: ClaimedInbox): Promise<boolean> {
    return this.fencedUpdate(claim, {
      status: InboxStatus.PROCESSED,
      processedAt: sql<Date>`now()`,
      lastError: null,
    } as unknown as InboxMessageUpdate);
  }

  async markFailed(
    claim: ClaimedInbox,
    error: string,
    nextAttemptAt: Date,
  ): Promise<boolean> {
    return this.fencedUpdate(claim, {
      status: InboxStatus.FAILED,
      lastError: error,
      retryCount: sql<number>`"retryCount" + 1`,
      nextAttemptAt,
    } as unknown as InboxMessageUpdate);
  }

  async markDlq(claim: ClaimedInbox, error: string): Promise<boolean> {
    return this.fencedUpdate(claim, {
      status: InboxStatus.DLQ,
      lastError: error,
    });
  }

  private classify(message: InboxMessage): InboxClaim {
    switch (message.status) {
      case InboxStatus.PROCESSED:
        return { outcome: 'ALREADY_PROCESSED', message };
      case InboxStatus.DLQ:
        return { outcome: 'DEAD_LETTERED', message };
      case InboxStatus.FAILED:
        return { outcome: 'RETRY_SCHEDULED', message };
      default:
        return { outcome: 'IN_PROGRESS', message };
    }
  }

  private async findByIdentity(identity: InboxIdentity): Promise<InboxMessage> {
    const found = await this.db
      .selectFrom('inbox_messages')
      .selectAll()
      .where('consumerId', '=', identity.consumerId)
      .where('eventId', '=', identity.eventId)
      .executeTakeFirst();
    if (!found) {
      throw new Error(
        `Inbox message missing after conflict for ${identity.consumerId}:${identity.eventId}`,
      );
    }
    return found;
  }

  private async fencedUpdate(
    claim: ClaimedInbox,
    changes: InboxMessageUpdate,
  ): Promise<boolean> {
    const result = await this.db
      .updateTable('inbox_messages')
      .set({
        ...changes,
        claimToken: null,
        lockedUntil: null,
        updatedAt: sql<Date>`now()`,
      } as unknown as InboxMessageUpdate)
      .where('id', '=', claim.message.id)
      .where('claimToken', '=', claim.claimToken)
      .where('status', '=', InboxStatus.PROCESSING)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }
}
