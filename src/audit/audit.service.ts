import { Injectable, Logger } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { AuditRepository, AuditLogInput } from './audit.repository';
import type { DbExecutor } from '../database/db-executor';
import type { NewAuditLog } from '../database/database.types';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditRepository: AuditRepository) {}

  async log(input: AuditLogInput, trx?: DbExecutor) {
    try {
      return await this.auditRepository.create(
        {
          id: nanoid(),
          actorType: input.actorType,
          actorId: input.actorId ?? null,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          before: input.before ?? null,
          after: input.after ?? null,
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
