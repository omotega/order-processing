import { Logger, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validate } from './config/config';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { BankingModule } from './banking/banking.module';
import { WebhookModule } from './webhook/webhook.module';
import { LedgerModule } from './ledger/ledger.module';
import { AuditModule } from './audit/audit.module';
import { BeneficiaryModule } from './beneficiary/beneficiary.module';
import { KycModule } from './kyc/kyc.module';
import { LimitsModule } from './limits/limits.module';
import { SettlementModule } from './settlement/settlement.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    DatabaseModule,
    RedisModule,
    EmailModule,
    AuditModule,
    LedgerModule,
    AuthModule,
    BankingModule,
    BeneficiaryModule,
    KycModule,
    LimitsModule,
    SettlementModule,
    WebhookModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    Logger,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
