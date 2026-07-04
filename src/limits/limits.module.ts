import { Module } from '@nestjs/common';
import { LimitsRepository } from './limits.repository';
import { LimitsService } from './limits.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [LimitsRepository, LimitsService],
  exports: [LimitsService, LimitsRepository],
})
export class LimitsModule {}
