import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor } from '@/database/db-executor';
import type {
  JsonValue,
  KycProfile,
  NewKycProfile,
} from '@/database/database.types';
import { newId } from '@/utils/id';
import { KycStatus } from '@/utils/database.enums';

export type PublicKycProfile = {
  status: KycProfile['status'];
  kycTier: number;
  bvnVerifiedAt: Date | null;
  verifiedAt: Date | null;
};

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

  findPublicProfileByUserId(userId: string, kycTier: number, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('kyc_profiles')
      .select(['status', 'verifiedAt', 'bvnVerifiedAt'])
      .where('userId', '=', userId)
      .executeTakeFirst()
      .then((row) =>
        row
          ? {
              status: row.status,
              kycTier,
              bvnVerifiedAt: row.bvnVerifiedAt,
              verifiedAt: row.verifiedAt,
            }
          : {
              status: KycStatus.PENDING,
              kycTier,
              bvnVerifiedAt: null,
              verifiedAt: null,
            },
      );
  }

  findByBvnHash(bvnHash: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('kyc_profiles')
      .select(['userId', 'id'])
      .where('bvnHash', '=', bvnHash)
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

  updateUserKycTier(userId: string, kycTier: number, trx?: DbExecutor) {
    return this.executor(trx)
      .updateTable('users')
      .set({ kycTier, updatedAt: new Date() })
      .where('id', '=', userId)
      .returning(['id', 'kycTier', 'status', 'firstName', 'lastName', 'email'])
      .executeTakeFirst();
  }

  updateUserLegalName(
    userId: string,
    firstName: string,
    lastName: string,
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .updateTable('users')
      .set({ firstName, lastName, updatedAt: new Date() })
      .where('id', '=', userId)
      .execute();
  }

  createVerificationAttempt(
    input: {
      kycProfileId: string;
      provider: string;
      providerReference: string | null;
      status: string;
      failureCode?: string | null;
      responseMetadata?: JsonValue | null;
    },
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .insertInto('kyc_verification_attempts')
      .values({
        id: newId(),
        kycProfileId: input.kycProfileId,
        provider: input.provider,
        providerReference: input.providerReference,
        status: input.status,
        failureCode: input.failureCode ?? null,
        responseMetadata: input.responseMetadata ?? null,
        completedAt: new Date(),
      } as never)
      .execute();
  }
}
