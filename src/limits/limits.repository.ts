import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { DbExecutor } from '../database/db-executor';
import type {
  NewTransactionLimit,
  TransactionLimit,
} from '../database/database.types';
import { LimitType } from '../utils/database.enums';

@Injectable()
export class LimitsRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  findByUserAndType(userId: string, limitType: LimitType, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('transaction_limits')
      .selectAll()
      .where('userId', '=', userId)
      .where('limitType', '=', limitType)
      .executeTakeFirst();
  }

  findByTierAndType(kycTier: number, limitType: LimitType, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('transaction_limits')
      .selectAll()
      .where('kycTier', '=', kycTier)
      .where('userId', 'is', null)
      .where('limitType', '=', limitType)
      .executeTakeFirst();
  }

  create(
    data: NewTransactionLimit,
    trx?: DbExecutor,
  ): Promise<TransactionLimit> {
    return this.executor(trx)
      .insertInto('transaction_limits')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  incrementUsage(id: string, amount: bigint, trx?: DbExecutor) {
    return this.executor(trx)
      .updateTable('transaction_limits')
      .set({
        currentUsage: (eb) => eb('currentUsage', '+', amount.toString()),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  resetPeriod(id: string, trx?: DbExecutor) {
    return this.executor(trx)
      .updateTable('transaction_limits')
      .set({
        currentUsage: 0n,
        periodStart: new Date(),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  listTierLimits(kycTier: number, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('transaction_limits')
      .selectAll()
      .where('kycTier', '=', kycTier)
      .where('userId', 'is', null)
      .execute();
  }
}
