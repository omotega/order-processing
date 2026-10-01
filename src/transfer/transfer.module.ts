import { Module } from '@nestjs/common';
import { TransferController } from '@/transfer/transfer.controller';
import { TransferService } from '@/transfer/transfer.service';
import { TransferAcceptService } from '@/transfer/acceptance/transfer-accept.service';
import { TransferIdempotencyService } from '@/transfer/acceptance/transfer-idempotency.service';
import { TransferOrchestrator } from '@/transfer/processing/transfer-orchestrator.service';
import { TransferConsumer } from '@/transfer/processing/transfer-consumer.service';
import { TransferVerifyService } from '@/transfer/verification/transfer-verify.service';
import { TransferVerifyQueueService } from '@/transfer/verification/transfer-verify-queue.service';
import { TransferSettlementService } from '@/transfer/settlement/transfer-settlement.service';
import { TransferReverseService } from '@/transfer/reversal/transfer-reverse.service';
import { TransferReverseConsumer } from '@/transfer/reversal/transfer-reverse-consumer.service';
import { TransferReversalCoordinator } from '@/transfer/reversal/transfer-reversal-coordinator.service';
import { TransferProviderEventService } from '@/transfer/provider-events/transfer-provider-event.service';
import { IdempotencyRepository } from '@database/repository/idempotency.repository';
import { TransferRepository } from '@database/repository/transfer.repository';
import { OutboxRepository } from '@database/repository/outbox.repository';
import { InboxRepository } from '@database/repository/inbox.repository';
import { InboxProcessor } from '@/kafka/inbox-processor.service';
import { RedisModule } from '@/redis/redis.module';
import { AuthModule } from '@/auth/auth.module';
import { LimitsModule } from '@/limits/limits.module';
import { PaymentProvidersModule } from '@/payment-providers/payment-providers.module';
import { IdempotencyKeyHeaderPipe } from '@/common/pipes/idempotency-key-header.pipe';

@Module({
  imports: [RedisModule, AuthModule, LimitsModule, PaymentProvidersModule],
  controllers: [TransferController],
  providers: [
    IdempotencyKeyHeaderPipe,
    TransferService,
    TransferAcceptService,
    TransferIdempotencyService,
    IdempotencyRepository,
    TransferRepository,
    TransferOrchestrator,
    TransferConsumer,
    TransferVerifyService,
    TransferVerifyQueueService,
    TransferSettlementService,
    TransferReverseService,
    TransferReverseConsumer,
    TransferReversalCoordinator,
    TransferProviderEventService,
    OutboxRepository,
    InboxRepository,
    InboxProcessor,
  ],
  exports: [TransferProviderEventService],
})
export class TransferModule {}
