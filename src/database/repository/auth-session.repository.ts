import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor } from '@/database/db-executor';
import type { Insertable, Selectable } from 'kysely';
import type { DB } from '@/database/database.generated';

export type AuthSession = Selectable<DB['auth_sessions']>;

@Injectable()
export class AuthSessionRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  create(
    input: {
      id: string;
      userId: string;
      refreshTokenHash: string;
      expiresAt: Date;
      userAgent: string | null;
    },
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .insertInto('auth_sessions')
      .values({
        id: input.id,
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent,
        revokedAt: null,
        createdAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findById(id: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('auth_sessions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  findByRefreshHash(refreshTokenHash: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('auth_sessions')
      .selectAll()
      .where('refreshTokenHash', '=', refreshTokenHash)
      .executeTakeFirst();
  }

  revoke(id: string, trx?: DbExecutor) {
    return this.executor(trx)
      .updateTable('auth_sessions')
      .set({ revokedAt: new Date() })
      .where('id', '=', id)
      .where('revokedAt', 'is', null)
      .executeTakeFirst();
  }

  revokeAllForUser(userId: string, trx?: DbExecutor) {
    return this.executor(trx)
      .updateTable('auth_sessions')
      .set({ revokedAt: new Date() })
      .where('userId', '=', userId)
      .where('revokedAt', 'is', null)
      .execute();
  }

  rotate(
    id: string,
    refreshTokenHash: string,
    expiresAt: Date,
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .updateTable('auth_sessions')
      .set({ refreshTokenHash, expiresAt })
      .where('id', '=', id)
      .where('revokedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }
}
