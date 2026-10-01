import { Module } from '@nestjs/common';
import { KycController } from '@/kyc/kyc.controller';
import { KycService } from '@/kyc/kyc.service';
import { KycRepository } from '@database/repository/kyc.repository';
import { LedgerModule } from '@/ledger/ledger.module';
import { AuthModule } from '@/auth/auth.module';
import { RedisModule } from '@/redis/redis.module';

@Module({
  imports: [LedgerModule, AuthModule, RedisModule],
  controllers: [KycController],
  providers: [KycService, KycRepository],
  exports: [KycService, KycRepository],
})
export class KycModule {}
