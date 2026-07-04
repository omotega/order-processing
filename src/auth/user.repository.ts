import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { DbExecutor } from '../database/db-executor';
import type { NewUser, User } from '../database/database.types';
import { KycStatus } from '../utils/database.enums';

type UserPublicFields = Pick<
  User,
  'id' | 'firstName' | 'lastName' | 'email' | 'isActive' | 'createdAt' | 'role'
>;

@Injectable()
export class UserRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  findByEmail(email: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();
  }

  findById(id: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('users')
      .select([
        'id',
        'email',
        'firstName',
        'lastName',
        'isActive',
        'createdAt',
        'updatedAt',
        'role',
        'kycStatus',
        'kycTier',
        'phoneVerifiedAt',
        'emailVerifiedAt',
      ])
      .where('id', '=', id)
      .executeTakeFirst();
  }

  updateLastLogin(id: string, trx?: DbExecutor) {
    return this.executor(trx)
      .updateTable('users')
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
  }

  findByIdWithPassword(id: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  create(data: NewUser, trx?: DbExecutor): Promise<UserPublicFields> {
    return this.executor(trx)
      .insertInto('users')
      .values(data)
      .returning([
        'id',
        'firstName',
        'lastName',
        'email',
        'isActive',
        'createdAt',
        'role',
      ])
      .executeTakeFirstOrThrow();
  }

  markEmailVerified(userId: string, trx?: DbExecutor) {
    return this.executor(trx)
      .updateTable('users')
      .set({
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where('id', '=', userId)
      .returning([
        'id',
        'email',
        'firstName',
        'lastName',
        'isActive',
        'emailVerifiedAt',
        'createdAt',
        'role',
      ])
      .executeTakeFirstOrThrow();
  }

  activateAfterBvn(id: string, trx: DbExecutor) {
    return trx
      .updateTable('users')
      .set({
        isActive: true,
        kycStatus: KycStatus.VERIFIED,
        kycTier: 1,
        phoneVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .returning([
        'id',
        'email',
        'firstName',
        'lastName',
        'isActive',
        'kycStatus',
        'kycTier',
        'phoneVerifiedAt',
      ])
      .executeTakeFirstOrThrow();
  }
}
