import { Module } from '@nestjs/common';
import { BankingController } from '@/banking/banking.controller';
import { BankingService } from '@/banking/banking.service';
import { RedisModule } from '@/redis/redis.module';
import { AuthModule } from '@/auth/auth.module';
import { PaymentProvidersModule } from '@/payment-providers/payment-providers.module';

@Module({
  imports: [RedisModule, AuthModule, PaymentProvidersModule],
  controllers: [BankingController],
  providers: [BankingService],
  exports: [BankingService],
})
export class BankingModule {}
