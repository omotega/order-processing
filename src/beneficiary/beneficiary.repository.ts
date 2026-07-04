import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { DbExecutor } from '../database/db-executor';
import type { Beneficiary, NewBeneficiary } from '../database/database.types';

@Injectable()
export class BeneficiaryRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  findByUserId(userId: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('beneficiaries')
      .selectAll()
      .where('userId', '=', userId)
      .where('isActive', '=', true)
      .orderBy('createdAt', 'desc')
      .execute();
  }

  findById(id: string, userId: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('beneficiaries')
      .selectAll()
      .where('id', '=', id)
      .where('userId', '=', userId)
      .executeTakeFirst();
  }

  findByAccount(
    userId: string,
    accountNumber: string,
    bankCode: string,
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .selectFrom('beneficiaries')
      .selectAll()
      .where('userId', '=', userId)
      .where('accountNumber', '=', accountNumber)
      .where('bankCode', '=', bankCode)
      .executeTakeFirst();
  }

  create(data: NewBeneficiary, trx?: DbExecutor): Promise<Beneficiary> {
    return this.executor(trx)
      .insertInto('beneficiaries')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async softDelete(id: string, userId: string, trx?: DbExecutor) {
    const result = await this.executor(trx)
      .updateTable('beneficiaries')
      .set({ isActive: false, updatedAt: new Date() })
      .where('id', '=', id)
      .where('userId', '=', userId)
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new NotFoundException('Beneficiary not found');
    }

    return result;
  }
}
