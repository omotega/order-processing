import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { DbExecutor } from '../database/db-executor';
import type {
  AuditLog,
  JsonValue,
  NewAuditLog,
} from '../database/database.types';

export interface AuditLogInput {
  actorType: NewAuditLog['actorType'];
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
}

@Injectable()
export class AuditRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  create(data: NewAuditLog, trx?: DbExecutor): Promise<AuditLog> {
    return this.executor(trx)
      .insertInto('audit_logs')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findByResource(resourceType: string, resourceId: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('audit_logs')
      .selectAll()
      .where('resourceType', '=', resourceType)
      .where('resourceId', '=', resourceId)
      .orderBy('createdAt', 'desc')
      .execute();
  }
}
