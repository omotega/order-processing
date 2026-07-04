import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { DbExecutor } from '../database/db-executor';
import type {
  NewReconciliationItem,
  NewSettlementBatch,
  ReconciliationItem,
  SettlementBatch,
} from '../database/database.types';
import {
  ReconciliationStatus,
  SettlementBatchStatus,
} from '../utils/database.enums';

@Injectable()
export class SettlementRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  createBatch(
    data: NewSettlementBatch,
    trx?: DbExecutor,
  ): Promise<SettlementBatch> {
    return this.executor(trx)
      .insertInto('settlement_batches')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findBatchById(id: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('settlement_batches')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  listBatches(trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('settlement_batches')
      .selectAll()
      .orderBy('batchDate', 'desc')
      .execute();
  }

  updateBatchStatus(
    id: string,
    status: SettlementBatchStatus,
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .updateTable('settlement_batches')
      .set({ status, updatedAt: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  createReconciliationItem(
    data: NewReconciliationItem,
    trx?: DbExecutor,
  ): Promise<ReconciliationItem> {
    return this.executor(trx)
      .insertInto('reconciliation_items')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findReconciliationByBatch(settlementBatchId: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('reconciliation_items')
      .selectAll()
      .where('settlementBatchId', '=', settlementBatchId)
      .execute();
  }

  findPaymentByReference(reference: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('payments')
      .selectAll()
      .where('paymentReference', '=', reference)
      .executeTakeFirst();
  }

  findTransactionByPaymentId(paymentId: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('transactions')
      .select('id')
      .where('paymentId', '=', paymentId)
      .executeTakeFirst();
  }

  updateReconciliationItem(
    id: string,
    data: {
      actualAmount?: bigint;
      status: ReconciliationStatus;
      discrepancyReason?: string | null;
    },
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .updateTable('reconciliation_items')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }
}
