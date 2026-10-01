import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor } from '@/database/db-executor';
import type {
  IdempotencyKey,
  JsonValue,
  NewIdempotencyKey,
} from '@/database/database.types';
import {
  IdempotencyKeyState,
  IdempotencyOperation,
  IdempotencyScopeType,
} from '@/utils/database.enums';

export const TRANSFER_ACCEPT_OPERATION = IdempotencyOperation.TRANSFER_ACCEPT;

export type IdempotencyScope = {
  scopeType: IdempotencyScopeType;
  scopeId: string;
  operationType: IdempotencyOperation;
  key: string;
};

export type BeginIdempotencyInput = IdempotencyScope & {
  requestHash: string;
  expiresAt: Date;
};

@Injectable()
export class IdempotencyRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  find(
    scope: IdempotencyScope,
    trx?: DbExecutor,
  ): Promise<IdempotencyKey | undefined> {
    return this.executor(trx)
      .selectFrom('idempotency_keys')
      .selectAll()
      .where('scopeType', '=', scope.scopeType)
      .where('scopeId', '=', scope.scopeId)
      .where('operationType', '=', scope.operationType)
      .where('key', '=', scope.key)
      .executeTakeFirst();
  }

  findByResourceId(
    operationType: IdempotencyOperation,
    resourceId: string,
    trx?: DbExecutor,
  ): Promise<IdempotencyKey | undefined> {
    return this.executor(trx)
      .selectFrom('idempotency_keys')
      .selectAll()
      .where('operationType', '=', operationType)
      .where('resourceId', '=', resourceId)
      .executeTakeFirst();
  }

  findForUpdate(
    scope: IdempotencyScope,
    trx: DbExecutor,
  ): Promise<IdempotencyKey | undefined> {
    return trx
      .selectFrom('idempotency_keys')
      .selectAll()
      .where('scopeType', '=', scope.scopeType)
      .where('scopeId', '=', scope.scopeId)
      .where('operationType', '=', scope.operationType)
      .where('key', '=', scope.key)
      .forUpdate()
      .executeTakeFirst();
  }

  /**
   * Atomic claim via ON CONFLICT DO NOTHING so the TX is never aborted on
   * uniqueness races (Postgres safe).
   */
  async tryBegin(
    input: BeginIdempotencyInput,
    trx?: DbExecutor,
  ): Promise<'claimed' | 'conflict'> {
    const row = await this.executor(trx)
      .insertInto('idempotency_keys')
      .values({
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        operationType: input.operationType,
        key: input.key,
        requestHash: input.requestHash,
        state: IdempotencyKeyState.IN_PROGRESS,
        response: null,
        resourceId: null,
        expiresAt: input.expiresAt,
      } as NewIdempotencyKey)
      .onConflict((oc) =>
        oc
          .columns(['scopeType', 'scopeId', 'operationType', 'key'])
          .doNothing(),
      )
      .returningAll()
      .executeTakeFirst();

    return row ? 'claimed' : 'conflict';
  }

  saveProvisionalResponse(
    scope: IdempotencyScope,
    resourceId: string,
    response: JsonValue,
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .updateTable('idempotency_keys')
      .set({
        resourceId,
        response,
        state: IdempotencyKeyState.IN_PROGRESS,
      })
      .where('scopeType', '=', scope.scopeType)
      .where('scopeId', '=', scope.scopeId)
      .where('operationType', '=', scope.operationType)
      .where('key', '=', scope.key)
      .where('state', '=', IdempotencyKeyState.IN_PROGRESS)
      .executeTakeFirst();
  }

  markPendingUncertain(
    scope: IdempotencyScope,
    response: JsonValue,
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .updateTable('idempotency_keys')
      .set({
        state: IdempotencyKeyState.PENDING_UNCERTAIN,
        response,
      })
      .where('scopeType', '=', scope.scopeType)
      .where('scopeId', '=', scope.scopeId)
      .where('operationType', '=', scope.operationType)
      .where('key', '=', scope.key)
      .where('state', 'in', [
        IdempotencyKeyState.IN_PROGRESS,
        IdempotencyKeyState.PENDING_UNCERTAIN,
      ])
      .executeTakeFirst();
  }

  finalize(scope: IdempotencyScope, response: JsonValue, trx?: DbExecutor) {
    return this.executor(trx)
      .updateTable('idempotency_keys')
      .set({
        state: IdempotencyKeyState.COMPLETE,
        response,
        completedAt: new Date(),
      })
      .where('scopeType', '=', scope.scopeType)
      .where('scopeId', '=', scope.scopeId)
      .where('operationType', '=', scope.operationType)
      .where('key', '=', scope.key)
      .where('state', 'in', [
        IdempotencyKeyState.IN_PROGRESS,
        IdempotencyKeyState.PENDING_UNCERTAIN,
      ])
      .executeTakeFirst();
  }

  /** @deprecated Use finalize() for provider outcomes or saveProvisionalResponse() for accept. */
  complete(scope: IdempotencyScope, response: JsonValue, trx?: DbExecutor) {
    return this.finalize(scope, response, trx);
  }
}
