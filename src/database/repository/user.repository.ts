import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor } from '@/database/db-executor';
import type { NewUser, User } from '@/database/database.types';
import { sql } from 'kysely';
import { UserRole, UserStatus } from '@/utils/database.enums';

type UserPublicFields = Pick<
  User,
  'id' | 'firstName' | 'lastName' | 'email' | 'status' | 'createdAt' | 'role'
>;

@Injectable()
export class UserRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  findByEmail(email: string, trx?: DbExecutor) {
    const normalized = email.toLowerCase();
    return this.executor(trx)
      .selectFrom('users')
      .selectAll()
      .where('email', '=', normalized)
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
        'status',
        'createdAt',
        'updatedAt',
        'role',
        'kycTier',
        'phoneVerifiedAt',
        'emailVerifiedAt',
        'transactionPinHash',
        'pinFailedAttempts',
        'pinLockedUntil',
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
        'status',
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
        'status',
        'emailVerifiedAt',
        'createdAt',
        'role',
      ])
      .executeTakeFirstOrThrow();
  }

  setKycTier(id: string, kycTier: number, trx: DbExecutor) {
    return trx
      .updateTable('users')
      .set({
        kycTier,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .returning(['id', 'email', 'firstName', 'lastName', 'status', 'kycTier'])
      .executeTakeFirstOrThrow();
  }

  createPending(input: { id: string; email: string; password: string }, trx?: DbExecutor) {
    return this.executor(trx)
      .insertInto('users')
      .values({
        id: input.id,
        email: input.email,
        firstName: null,
        lastName: null,
        phone: null,
        password: input.password,
        role: UserRole.USER,
        status: UserStatus.PENDING_VERIFICATION,
        kycTier: 0,
        updatedAt: new Date(),
      } as NewUser)
      .returning(['id', 'email', 'status', 'role'])
      .executeTakeFirstOrThrow();
  }

  activateWithPassword(
    id: string,
    passwordHash: string,
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .updateTable('users')
      .set({
        password: passwordHash,
        emailVerifiedAt: new Date(),
        status: UserStatus.ACTIVE,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .where('status', '=', UserStatus.PENDING_VERIFICATION)
      .returning([
        'id',
        'email',
        'firstName',
        'lastName',
        'status',
        'role',
        'kycTier',
        'emailVerifiedAt',
      ])
      .executeTakeFirst();
  }

  setPassword(id: string, passwordHash: string, trx?: DbExecutor) {
    return this.executor(trx)
      .updateTable('users')
      .set({
        password: passwordHash,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
  }

  clearLoginFailures(id: string, trx?: DbExecutor) {
    return this.executor(trx)
      .updateTable('users')
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
  }

  async recordFailedLogin(id: string, trx?: DbExecutor) {
    const updated = await this.executor(trx)
      .updateTable('users')
      .set({
        failedLoginAttempts: sql<number>`"failedLoginAttempts" + 1`,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .returning(['failedLoginAttempts', 'lockedUntil'])
      .executeTakeFirst();
    if (updated && updated.failedLoginAttempts >= 5 && !updated.lockedUntil) {
      const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      return this.executor(trx)
        .updateTable('users')
        .set({ lockedUntil: lockUntil, updatedAt: new Date() })
        .where('id', '=', id)
        .returning(['failedLoginAttempts', 'lockedUntil'])
        .executeTakeFirst();
    }
    return updated;
  }

  setTransactionPin(id: string, pinHash: string, trx?: DbExecutor) {
    return this.executor(trx)
      .updateTable('users')
      .set({
        transactionPinHash: pinHash,
        pinFailedAttempts: 0,
        pinLockedUntil: null,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
  }

  async recordFailedPin(id: string, trx?: DbExecutor) {
    const updated = await this.executor(trx)
      .updateTable('users')
      .set({
        pinFailedAttempts: sql<number>`"pinFailedAttempts" + 1`,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .returning(['pinFailedAttempts', 'pinLockedUntil'])
      .executeTakeFirst();
    if (updated && updated.pinFailedAttempts >= 5) {
      const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      return this.executor(trx)
        .updateTable('users')
        .set({ pinLockedUntil: lockUntil, updatedAt: new Date() })
        .where('id', '=', id)
        .returning(['pinFailedAttempts', 'pinLockedUntil'])
        .executeTakeFirst();
    }
    return updated;
  }

  clearPinFailures(id: string, trx?: DbExecutor) {
    return this.executor(trx)
      .updateTable('users')
      .set({
        pinFailedAttempts: 0,
        pinLockedUntil: null,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
  }
}
