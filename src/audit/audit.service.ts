import { Injectable, Logger } from '@nestjs/common';
import { newId } from '@/utils/id';
import {
  AuditRepository,
  AuditLogInput,
} from '@database/repository/audit.repository';
import type { DbExecutor } from '@/database/db-executor';
import type { JsonValue, NewAuditLog } from '@/database/database.types';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditRepository: AuditRepository) {}

  async log(input: AuditLogInput, trx?: DbExecutor) {
    try {
      const changes =
        input.changes ??
        (input.before !== undefined || input.after !== undefined
          ? ({
              ...(input.before !== undefined ? { before: input.before } : {}),
              ...(input.after !== undefined ? { after: input.after } : {}),
            } as JsonValue)
          : null);

      return await this.auditRepository.create(
        {
          id: newId(),
          actorType: input.actorType,
          actorId: input.actorId ?? null,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          changes,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          correlationId: input.correlationId ?? null,
        } as NewAuditLog,
        trx,
      );
    } catch (error) {
      this.logger.error('Failed to write audit log', {
        action: input.action,
        error: error.message,
      });
    }
  }

  findByResource(resourceType: string, resourceId: string) {
    return this.auditRepository.findByResource(resourceType, resourceId);
  }
}
