import { Module } from '@nestjs/common';
import { LimitsRepository } from '@database/repository/limits.repository';
import { LimitsService } from '@/limits/limits.service';
import { AuthModule } from '@/auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [LimitsRepository, LimitsService],
  exports: [LimitsService, LimitsRepository],
})
export class LimitsModule {}
