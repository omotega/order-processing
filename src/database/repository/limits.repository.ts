import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor } from '@/database/db-executor';
import type {
  LimitPolicy,
  LimitUsage,
  NewLimitPolicy,
  NewLimitUsage,
} from '@/database/database.types';
import { LimitType } from '@/utils/database.enums';

@Injectable()
export class LimitsRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  findPolicyByTierAndType(
    kycTier: number,
    limitType: LimitType,
    currency = 'NGN',
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .selectFrom('limit_policies')
      .selectAll()
      .where('kycTier', '=', kycTier)
      .where('limitType', '=', limitType)
      .where('currency', '=', currency)
      .executeTakeFirst();
  }

  createPolicy(data: NewLimitPolicy, trx?: DbExecutor): Promise<LimitPolicy> {
    return this.executor(trx)
      .insertInto('limit_policies')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  createPolicyIfMissing(
    data: NewLimitPolicy,
    trx?: DbExecutor,
  ): Promise<LimitPolicy | undefined> {
    return this.executor(trx)
      .insertInto('limit_policies')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['kycTier', 'limitType', 'currency']).doNothing(),
      )
      .returningAll()
      .executeTakeFirst();
  }

  findUsageForPeriod(
    userId: string,
    limitType: LimitType,
    periodStart: Date,
    currency = 'NGN',
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .selectFrom('limit_usage')
      .selectAll()
      .where('userId', '=', userId)
      .where('limitType', '=', limitType)
      .where('periodStart', '=', periodStart)
      .where('currency', '=', currency)
      .executeTakeFirst();
  }

  findCurrentUsage(
    userId: string,
    limitType: LimitType,
    now: Date,
    currency = 'NGN',
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .selectFrom('limit_usage')
      .selectAll()
      .where('userId', '=', userId)
      .where('limitType', '=', limitType)
      .where('currency', '=', currency)
      .where('periodStart', '<=', now)
      .where('periodEnd', '>', now)
      .executeTakeFirst();
  }

  createUsage(data: NewLimitUsage, trx?: DbExecutor): Promise<LimitUsage> {
    return this.executor(trx)
      .insertInto('limit_usage')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  createUsageIfMissing(
    data: NewLimitUsage,
    trx?: DbExecutor,
  ): Promise<LimitUsage | undefined> {
    return this.executor(trx)
      .insertInto('limit_usage')
      .values(data)
      .onConflict((oc) =>
        oc
          .columns(['userId', 'limitType', 'periodStart', 'currency'])
          .doNothing(),
      )
      .returningAll()
      .executeTakeFirst();
  }

  incrementReserved(id: string, amount: bigint, trx?: DbExecutor) {
    return this.executor(trx)
      .updateTable('limit_usage')
      .set({
        reservedAmount: (eb) => eb('reservedAmount', '+', amount.toString()),
        updatedAt: new Date(),
        version: (eb) => eb('version', '+', 1),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  decrementReserved(id: string, amount: bigint, trx?: DbExecutor) {
    return this.executor(trx)
      .updateTable('limit_usage')
      .set({
        reservedAmount: sql`GREATEST(0, "reservedAmount" - ${amount.toString()}::bigint)`,
        updatedAt: new Date(),
        version: (eb) => eb('version', '+', 1),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  listPoliciesByTier(kycTier: number, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('limit_policies')
      .selectAll()
      .where('kycTier', '=', kycTier)
      .execute();
  }
}
