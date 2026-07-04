import { Global, Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

@Global()
@Module({
  providers: [AuditRepository, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
