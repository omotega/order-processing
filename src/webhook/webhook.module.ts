import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookMonitoringController } from './webhook-monitoring.controller';
import { WebhookService } from './webhook.service';
import { WebhookProducerService } from './webhook-producer.service';
import { WebhookConsumerService } from './webhook-consumer.service';
import { WebhookEventRepository } from './webhook-event.repository';
import { RedisModule } from '../redis/redis.module';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';
import { BankingModule } from '../banking/banking.module';

@Module({
  imports: [RedisModule, RabbitMQModule, BankingModule],
  controllers: [WebhookController, WebhookMonitoringController],
  providers: [
    WebhookService,
    WebhookProducerService,
    WebhookConsumerService,
    WebhookEventRepository,
  ],
  exports: [WebhookService, WebhookProducerService],
})
export class WebhookModule {}
