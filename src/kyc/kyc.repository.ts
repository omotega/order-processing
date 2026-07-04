import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { DbExecutor } from '../database/db-executor';
import type { KycProfile, NewKycProfile } from '../database/database.types';
import { KycStatus } from '../utils/database.enums';

@Injectable()
export class KycRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  findByUserId(userId: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('kyc_profiles')
      .selectAll()
      .where('userId', '=', userId)
      .executeTakeFirst();
  }

  create(data: NewKycProfile, trx?: DbExecutor): Promise<KycProfile> {
    return this.executor(trx)
      .insertInto('kyc_profiles')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  update(userId: string, data: Partial<KycProfile>, trx?: DbExecutor) {
    return this.executor(trx)
      .updateTable('kyc_profiles')
      .set({ ...data, updatedAt: new Date() })
      .where('userId', '=', userId)
      .returningAll()
      .executeTakeFirst();
  }

  updateUserKyc(
    userId: string,
    kycStatus: KycStatus,
    kycTier: number,
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .updateTable('users')
      .set({ kycStatus, kycTier, updatedAt: new Date() })
      .where('id', '=', userId)
      .returning(['id', 'kycStatus', 'kycTier'])
      .executeTakeFirst();
  }
}
