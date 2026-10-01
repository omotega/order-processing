import { Logger, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { validate } from '@/config/config';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@/database/database.module';
import { RedisModule } from '@/redis/redis.module';
import { AuthModule } from '@/auth/auth.module';
import { BankingModule } from '@/banking';
import { TransferModule } from '@/transfer';
import { WebhookModule } from '@/webhook/webhook.module';
import { LedgerModule } from '@/ledger/ledger.module';
import { AuditModule } from '@/audit/audit.module';
import { BeneficiaryModule } from '@/beneficiary/beneficiary.module';
import { KycModule } from '@/kyc/kyc.module';
import { LimitsModule } from '@/limits/limits.module';
import { SettlementModule } from '@/settlement/settlement.module';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { EmailModule } from '@/email/email.module';
import { PaymentProvidersModule } from '@/payment-providers/payment-providers.module';
import { KafkaModule } from '@/kafka/kafka.module';
import { HttpLoggingInterceptor } from '@/interceptors/http-logging.interceptor';
import { CorrelationIdMiddleware } from '@/middleware/correlation-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    EmailModule,
    AuditModule,
    LedgerModule,
    AuthModule,
    BankingModule,
    TransferModule,
    BeneficiaryModule,
    KycModule,
    LimitsModule,
    SettlementModule,
    WebhookModule,
    PaymentProvidersModule,
    KafkaModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    Logger,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
