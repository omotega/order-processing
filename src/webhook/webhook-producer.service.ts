import { Injectable, Logger } from '@nestjs/common';
import { RabbitMQService, WebhookMessage } from '../rabbitmq/rabbitmq.service';
import { ROUTING_KEYS } from '../rabbitmq/rabbitmq.constants';
import { PaystackWebhookPayload } from './dto/webhook.validation';
import { nanoid } from 'nanoid';

@Injectable()
export class WebhookProducerService {
  private readonly logger = new Logger(WebhookProducerService.name);

  constructor(private readonly rabbitMQService: RabbitMQService) {}

  /**
   * Publish webhook event to RabbitMQ queue
   */
  async publishWebhookEvent(payload: PaystackWebhookPayload): Promise<boolean> {
    try {
      const routingKey = this.getRoutingKey(payload.event);

      const message: WebhookMessage = {
        eventId: nanoid(),
        eventType: payload.event,
        timestamp: new Date().toISOString(),
        source: 'paystack',
        payload: payload,
        metadata: {
          receivedAt: new Date().toISOString(),
          signature: 'verified',
          attempt: 1,
        },
      };

      const published = await this.rabbitMQService.publishWebhookEvent(
        routingKey,
        message,
      );

      if (published) {
        this.logger.log('Webhook event published to queue', {
          eventId: message.eventId,
          eventType: payload.event,
          reference: payload.data?.reference,
        });
      } else {
        this.logger.error('Failed to publish webhook event', {
          eventType: payload.event,
          reference: payload.data?.reference,
        });
      }

      return published;
    } catch (error) {
      this.logger.error('Error publishing webhook event', {
        error: error.message,
        event: payload.event,
      });
      return false;
    }
  }

  /**
   * Get routing key based on event type
   */
  private getRoutingKey(eventType: string): string {
    const routingKeyMap: Record<string, string> = {
      'transfer.success': ROUTING_KEYS.TRANSFER_SUCCESS,
      'transfer.failed': ROUTING_KEYS.TRANSFER_FAILED,
      'transfer.reversed': ROUTING_KEYS.TRANSFER_REVERSED,
      'charge.success': ROUTING_KEYS.CHARGE_SUCCESS,
      'charge.failed': ROUTING_KEYS.CHARGE_FAILED,
    };

    return routingKeyMap[eventType] || `webhook.${eventType}`;
  }
}
