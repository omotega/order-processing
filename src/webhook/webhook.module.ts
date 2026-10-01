import { Module } from '@nestjs/common';
import { WebhookController } from '@/webhook/webhook.controller';
import { WebhookMonitoringController } from '@/webhook/webhook-monitoring.controller';
import { WebhookService } from '@/webhook/webhook.service';
import { WebhookKafkaConsumerService } from '@/webhook/webhook-kafka-consumer.service';
import { WebhookEventRepository } from '@database/repository/webhook-event.repository';
import { ProcessedWebhookRepository } from '@database/repository/processed-webhook.repository';
import { TransferModule } from '@/transfer';
import { OutboxRepository } from '@database/repository/outbox.repository';
import { InboxRepository } from '@database/repository/inbox.repository';
import { InboxProcessor } from '@/kafka/inbox-processor.service';

@Module({
  imports: [TransferModule],
  controllers: [WebhookController, WebhookMonitoringController],
  providers: [
    WebhookService,
    WebhookKafkaConsumerService,
    WebhookEventRepository,
    ProcessedWebhookRepository,
    OutboxRepository,
    InboxRepository,
    InboxProcessor,
  ],
  exports: [WebhookService],
})
export class WebhookModule {}
