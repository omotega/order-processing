import { Module } from '@nestjs/common';
import { KycController } from '@/kyc/kyc.controller';
import { KycService } from '@/kyc/kyc.service';
import { KycRepository } from '@database/repository/kyc.repository';
import { AuthModule } from '@/auth/auth.module';
import { RedisModule } from '@/redis/redis.module';
import {
  BVN_VERIFIER,
  MonoBvnVerifier,
} from '@/services/mono/bvn-verifier';

@Module({
  imports: [AuthModule, RedisModule],
  controllers: [KycController],
  providers: [
    KycService,
    KycRepository,
    MonoBvnVerifier,
    { provide: BVN_VERIFIER, useExisting: MonoBvnVerifier },
  ],
  exports: [KycService, KycRepository],
})
export class KycModule {}
