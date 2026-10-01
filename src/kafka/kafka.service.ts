import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  Kafka,
  Producer,
  Consumer,
  KafkaConfig,
  ProducerConfig,
} from 'kafkajs';
import { appConfig } from '@/config/config';
import { KafkaMessage, KafkaConsumerOptions } from '@/kafka/kafka.types';
import { KafkaTopic } from '@/kafka/kafka.topics';
import {
  KAFKA_PRODUCER_MAX_RETRY_TIME,
  KAFKA_CONSUMER_SESSION_TIMEOUT,
  KAFKA_CONSUMER_HEARTBEAT_INTERVAL,
  KAFKA_CONSUMER_MAX_WAIT_TIME_MS,
} from '@/kafka/kafka.constants';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private readonly client: Kafka;
  private readonly producer: Producer;

  constructor() {
    // Client must exist before other providers' onModuleInit call createTopic /
    // createConsumer (Nest does not guarantee KafkaService.onModuleInit runs first).
    this.client = new Kafka(this.buildClientConfig());
    this.producer = this.client.producer(this.buildProducerConfig());
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
    this.logger.log(`Kafka producer connected to ${appConfig.kafka.broker}`);
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.producer.disconnect();
      this.logger.log('Kafka producer disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting Kafka producer', error);
    }
  }

  async produce(topic: KafkaTopic, message: KafkaMessage): Promise<void> {
    await this.producer.send({
      topic,
      messages: [
        {
          key: message.key,
          value: JSON.stringify(message.value),
          headers: message.headers,
        },
      ],
    });
  }

  async produceBatch(
    messages: Array<{ topic: KafkaTopic; message: KafkaMessage }>,
  ): Promise<void> {
    const grouped = new Map<string, typeof messages>();
    for (const item of messages) {
      const existing = grouped.get(item.topic) ?? [];
      existing.push(item);
      grouped.set(item.topic, existing);
    }

    await this.producer.sendBatch({
      topicMessages: Array.from(grouped.entries()).map(([topic, items]) => ({
        topic,
        messages: items.map((item) => ({
          key: item.message.key,
          value: JSON.stringify(item.message.value),
          headers: item.message.headers,
        })),
      })),
    });
  }

  createConsumer(groupId: string, options?: KafkaConsumerOptions): Consumer {
    const consumerGroupId = `${appConfig.kafka.consumerGroupPrefix}-${groupId}`;
    const consumer = this.client.consumer({
      groupId: consumerGroupId,
      sessionTimeout: options?.sessionTimeout ?? KAFKA_CONSUMER_SESSION_TIMEOUT,
      heartbeatInterval:
        options?.heartbeatInterval ?? KAFKA_CONSUMER_HEARTBEAT_INTERVAL,
      maxWaitTimeInMs:
        options?.maxWaitTimeInMs ?? KAFKA_CONSUMER_MAX_WAIT_TIME_MS,
      minBytes: options?.minBytes ?? 1,
      maxBytes: options?.maxBytes ?? 1048576,
    });

    return consumer;
  }

  async createTopic(topic: KafkaTopic, partitions?: number): Promise<void> {
    const admin = this.client.admin();
    try {
      await admin.connect();
      const existing = await admin.listTopics();
      if (!existing.includes(topic)) {
        const created = await admin.createTopics({
          topics: [
            {
              topic,
              numPartitions: partitions ?? 3,
              replicationFactor: 1,
            },
          ],
          waitForLeaders: true,
        });
        if (!created) {
          this.logger.warn(
            `createTopics returned false for ${topic}; verifying metadata`,
          );
        } else {
          this.logger.log(`Topic created: ${topic}`);
        }
      }

      await this.waitUntilTopicExists(admin, topic);
    } catch (error) {
      this.logger.error(`Failed to create topic ${topic}`, error);
      throw error;
    } finally {
      await admin.disconnect().catch(() => undefined);
    }
  }

  private async waitUntilTopicExists(
    admin: ReturnType<Kafka['admin']>,
    topic: string,
    attempts = 10,
    delayMs = 200,
  ): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      const topics = await admin.listTopics();
      if (topics.includes(topic)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error(
      `Topic ${topic} not visible in broker metadata after create`,
    );
  }

  async healthCheck(): Promise<boolean> {
    const admin = this.client.admin();
    try {
      await admin.connect();
      await admin.listTopics();
      return true;
    } catch {
      return false;
    } finally {
      await admin.disconnect();
    }
  }

  private buildClientConfig(): KafkaConfig {
    return {
      clientId: appConfig.kafka.clientId,
      brokers: [appConfig.kafka.broker],
      retry: {
        retries: 10,
        initialRetryTime: 300,
        maxRetryTime: KAFKA_PRODUCER_MAX_RETRY_TIME,
      },
    };
  }

  private buildProducerConfig(): ProducerConfig {
    return {
      idempotent: true,
      maxInFlightRequests: 5,
    };
  }
}
