import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as amqp from 'amqp-connection-manager';
import { ChannelWrapper } from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage, Options } from 'amqplib';
import { appConfig } from '../config/config';
import {
  EXCHANGES,
  QUEUES,
  QUEUE_OPTIONS,
  // ROUTING_KEYS,
} from './rabbitmq.constants';

export interface WebhookMessage {
  eventId: string;
  eventType: string;
  timestamp: string;
  source: string;
  payload: any;
  metadata: {
    receivedAt: string;
    signature: string;
    attempt: number;
  };
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.AmqpConnectionManager;
  private channelWrapper: ChannelWrapper;

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * Connect to RabbitMQ
   */
  private async connect(): Promise<void> {
    try {
      this.logger.log('Connecting to RabbitMQ...');

      this.connection = amqp.connect([appConfig.rabbitmq.url], {
        heartbeatIntervalInSeconds: 30,
        reconnectTimeInSeconds: 30,
      });

      this.connection.on('connect', () => {
        this.logger.log('Connected to RabbitMQ');
      });

      this.connection.on('disconnect', (err) => {
        this.logger.error('Disconnected from RabbitMQ', err);
      });

      this.channelWrapper = this.connection.createChannel({
        json: true,
        setup: async (channel: ConfirmChannel) => {
          await this.setupExchangesAndQueues(channel);
        },
      });

      await this.channelWrapper.waitForConnect();
      this.logger.log('RabbitMQ channel ready');
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ', error);
      throw error;
    }
  }

  /**
   * Setup exchanges and queues
   */
  private async setupExchangesAndQueues(
    channel: ConfirmChannel,
  ): Promise<void> {
    try {
      // Create main webhook exchange (topic exchange for flexible routing)
      await channel.assertExchange(EXCHANGES.WEBHOOK, 'topic', {
        durable: true,
      });

      // Create Dead Letter Exchange
      await channel.assertExchange(EXCHANGES.DLX, 'direct', {
        durable: true,
      });

      // Create main webhook queue
      await channel.assertQueue(QUEUES.WEBHOOK_EVENTS, QUEUE_OPTIONS);

      // Create Dead Letter Queue
      await channel.assertQueue(QUEUES.WEBHOOK_EVENTS_DLQ, {
        durable: true,
      });

      // Bind main queue to exchange with all routing keys
      await channel.bindQueue(
        QUEUES.WEBHOOK_EVENTS,
        EXCHANGES.WEBHOOK,
        'webhook.#', // Match all webhook.* routing keys
      );

      // Bind DLQ to DLX
      await channel.bindQueue(
        QUEUES.WEBHOOK_EVENTS_DLQ,
        EXCHANGES.DLX,
        'webhook.dlq',
      );

      this.logger.log('RabbitMQ exchanges and queues setup complete');
    } catch (error) {
      this.logger.error('Failed to setup exchanges and queues', error);
      throw error;
    }
  }

  /**
   * Publish message to queue
   */
  async publishWebhookEvent(
    routingKey: string,
    message: WebhookMessage,
  ): Promise<boolean> {
    try {
      await this.channelWrapper.publish(
        EXCHANGES.WEBHOOK,
        routingKey,
        message,
        {
          deliveryMode: 2,
          contentType: 'application/json',
          timestamp: Date.now(),
        } as Options.Publish,
      );

      this.logger.log('Message published to queue', {
        routingKey,
        eventId: message.eventId,
        eventType: message.eventType,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to publish message', {
        error: error.message,
        routingKey,
        eventId: message.eventId,
      });
      return false;
    }
  }

  /**
   * Subscribe to webhook events
   */
  async consumeWebhookEvents(
    handler: (message: WebhookMessage, rawMsg: ConsumeMessage) => Promise<void>,
  ): Promise<void> {
    try {
      await this.channelWrapper.addSetup(async (channel: ConfirmChannel) => {
        await channel.prefetch(10); // Prefetch 10 messages

        await channel.consume(
          QUEUES.WEBHOOK_EVENTS,
          async (msg: ConsumeMessage | null) => {
            if (!msg) {
              return;
            }

            try {
              const content = JSON.parse(msg.content.toString());

              this.logger.log('Processing message from queue', {
                eventId: content.eventId,
                eventType: content.eventType,
                attempt: content.metadata?.attempt || 1,
              });

              // Process message
              await handler(content, msg);

              // Acknowledge message (remove from queue)
              channel.ack(msg);

              this.logger.log('Message processed successfully', {
                eventId: content.eventId,
              });
            } catch (error) {
              this.logger.error('Failed to process message', {
                error: error.message,
                messageId: msg.properties.messageId,
              });

              // Check retry count
              const retryCount =
                (msg.properties.headers['x-retry-count'] || 0) + 1;
              const maxRetries = 3;

              if (retryCount < maxRetries) {
                // Retry: Reject and requeue
                this.logger.warn('Requeuing message for retry', {
                  retryCount,
                  maxRetries,
                });

                // Update retry count
                msg.properties.headers['x-retry-count'] = retryCount;

                // Reject and requeue with delay (exponential backoff simulation)
                channel.nack(msg, false, true);
              } else {
                // Max retries exceeded: Send to DLQ
                this.logger.error('Max retries exceeded, sending to DLQ', {
                  messageId: msg.properties.messageId,
                });

                // Reject without requeue (goes to DLQ)
                channel.nack(msg, false, false);
              }
            }
          },
          {
            noAck: false, // Manual acknowledgment
          },
        );
      });

      this.logger.log('Started consuming webhook events');
    } catch (error) {
      this.logger.error('Failed to start consumer', error);
      throw error;
    }
  }

  /**
   * Get queue stats
   */
  async getQueueStats(queueName: string): Promise<any> {
    try {
      const stats = await this.channelWrapper.checkQueue(queueName);
      return {
        messageCount: stats.messageCount,
        consumerCount: stats.consumerCount,
      };
    } catch (error) {
      this.logger.error('Failed to get queue stats', error);
      return null;
    }
  }

  /**
   * Disconnect from RabbitMQ
   */
  private async disconnect(): Promise<void> {
    try {
      await this.channelWrapper.close();
      await this.connection.close();
      this.logger.log('Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error('Error disconnecting from RabbitMQ', error);
    }
  }
}
