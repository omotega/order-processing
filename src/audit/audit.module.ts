import { Global, Module } from '@nestjs/common';
import { AuditRepository } from '@database/repository/audit.repository';
import { AuditService } from '@/audit/audit.service';

@Global()
@Module({
  providers: [AuditRepository, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
