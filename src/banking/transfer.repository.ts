import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { DbExecutor } from '../database/db-executor';
import type {
  NewPayment,
  NewTransaction,
  Payment,
  Transaction,
} from '../database/database.types';

@Injectable()
export class TransferRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  findByIdempotencyKey(idempotencyKey: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('transactions')
      .selectAll()
      .where('idempotencyKey', '=', idempotencyKey)
      .executeTakeFirst();
  }

  createPayment(data: NewPayment, trx?: DbExecutor): Promise<Payment> {
    return this.executor(trx)
      .insertInto('payments')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  createTransaction(
    data: NewTransaction,
    trx?: DbExecutor,
  ): Promise<Transaction> {
    return this.executor(trx)
      .insertInto('transactions')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findByReference(reference: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('transactions')
      .selectAll()
      .where('reference', '=', reference)
      .executeTakeFirst();
  }

  async createPaymentAndTransaction(
    payment: NewPayment,
    transaction: NewTransaction,
    trx?: DbExecutor,
  ) {
    const run = async (executor: DbExecutor) => {
      const createdPayment = await this.createPayment(payment, executor);
      const createdTransaction = await this.createTransaction(
        {
          ...transaction,
          paymentId: createdPayment.id,
        },
        executor,
      );

      return { payment: createdPayment, transaction: createdTransaction };
    };

    if (trx) {
      return run(trx);
    }

    return this.db.transaction().execute(run);
  }
}
