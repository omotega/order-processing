/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService, WebhookMessage } from '../rabbitmq/rabbitmq.service';
import { WebhookService } from './webhook.service';
import { ConsumeMessage } from 'amqplib';

@Injectable()
export class WebhookConsumerService implements OnModuleInit {
  private readonly logger = new Logger(WebhookConsumerService.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly webhookService: WebhookService,
  ) {}

  async onModuleInit() {
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

      // Process the webhook using the existing webhook service
      await this.webhookService.processWebhook(message.payload);

      this.logger.log('Webhook message processed successfully', {
        eventId: message.eventId,
        reference: message.payload.data?.reference,
      });
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
