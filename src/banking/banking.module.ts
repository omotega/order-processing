import { Module } from '@nestjs/common';
import { BankingController } from './banking.controller';
import { BankingService } from './banking.service';
import { TransferRepository } from './transfer.repository';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { BeneficiaryModule } from '../beneficiary/beneficiary.module';
import { LimitsModule } from '../limits/limits.module';

@Module({
  imports: [RedisModule, AuthModule, BeneficiaryModule, LimitsModule],
  controllers: [BankingController],
  providers: [BankingService, TransferRepository],
  exports: [BankingService, TransferRepository],
})
export class BankingModule {}
