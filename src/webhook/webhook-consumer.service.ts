/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService, WebhookMessage } from '@/rabbitmq/rabbitmq.service';
import { WebhookService } from '@/webhook/webhook.service';
import { ConsumeMessage } from 'amqplib';

@Injectable()
export class WebhookConsumerService implements OnModuleInit {
  private readonly logger = new Logger(WebhookConsumerService.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly webhookService: WebhookService,
  ) {}

  async onModuleInit() {
    // TODO(SYNC_DEBUG): restore webhook consumer after Paystack bug is fixed.
    this.logger.warn('Webhook consumer disabled (SYNC_DEBUG)');
    return;
    await this.startConsumer();
  }

  /**
   * Start consuming webhook events from RabbitMQ
   */
  private async startConsumer(): Promise<void> {
    this.logger.log('Starting webhook consumer...');

    await this.rabbitMQService.consumeWebhookEvents(
      async (message: WebhookMessage, rawMsg: ConsumeMessage) => {
        await this.processWebhookMessage(message, rawMsg);
      },
    );

    this.logger.log('Webhook consumer started successfully');
  }

  /**
   * Process individual webhook message
   */
  private async processWebhookMessage(
    message: WebhookMessage,
    rawMsg: ConsumeMessage,
  ): Promise<void> {
    try {
      this.logger.log('Processing webhook message', {
        eventId: message.eventId,
        eventType: message.eventType,
        reference: message.payload.data?.reference,
        attempt: message.metadata.attempt,
      });

      this.logger.warn(
        'RabbitMQ webhook path is retired; use Kafka webhook.jobs',
        {
          eventId: message.eventId,
          eventType: message.eventType,
        },
      );
    } catch (error) {
      this.logger.error('Failed to process webhook message', {
        error: error.message,
        stack: error.stack,
        eventId: message.eventId,
        eventType: message.eventType,
        reference: message.payload.data?.reference,
      });

      // Re-throw error to trigger RabbitMQ retry logic
      throw error;
    }
  }

  /**
   * Get consumer status
   */
  async getConsumerStatus(): Promise<any> {
    const stats = await this.rabbitMQService.getQueueStats('webhook.events');

    return {
      status: stats ? 'healthy' : 'unhealthy',
      queueDepth: stats?.messageCount || 0,
      consumerCount: stats?.consumerCount || 0,
      timestamp: new Date().toISOString(),
    };
  }
}
