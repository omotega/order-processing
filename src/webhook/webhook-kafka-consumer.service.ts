import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Consumer } from 'kafkajs';
import { KafkaService } from '@/kafka/kafka.service';
import {
  InboxRepository,
  type ClaimedInbox,
} from '@database/repository/inbox.repository';
import { InboxProcessor } from '@/kafka/inbox-processor.service';
import { KafkaConsumerId } from '@/kafka/kafka.consumers';
import {
  INBOX_RETRY_BATCH_SIZE,
  INBOX_RETRY_SWEEP_INTERVAL_MS,
} from '@/kafka/kafka.constants';
import { WebhookTopic } from '@/kafka/kafka.topics';
import type { JsonValue } from '@/database/database.types';
import { unwrapConnectJson } from '@/kafka/unwrap-connect-json';
import {
  fullJitterDelayMs,
  isRetryableError,
  sleep,
} from '@/kafka/retry-with-jitter';
import { errorLogContext } from '@/common/errors/classified.error';
import {
  webhookJobSchema,
  type WebhookJob,
} from '@/webhook/dto/webhook-job.schema';
import { WebhookService } from '@/webhook/webhook.service';
import { WEBHOOK_LOG_EVENTS } from '@/webhook/webhook.constants';

const MAX_RETRIES = 3;

@Injectable()
export class WebhookKafkaConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WebhookKafkaConsumerService.name);
  private consumer: Consumer | null = null;

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly webhookService: WebhookService,
    private readonly inboxRepository: InboxRepository,
    private readonly inboxProcessor: InboxProcessor,
  ) {}

  async onModuleInit() {
    await this.kafkaService.createTopic(WebhookTopic.JOBS);
    await this.kafkaService.createTopic(WebhookTopic.DLQ);
    this.consumer = this.kafkaService.createConsumer(
      KafkaConsumerId.WEBHOOK_PROCESSING,
    );
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: WebhookTopic.JOBS,
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message, heartbeat }) => {
        const raw = message.value?.toString();
        if (!raw) {
          return;
        }

        let job: WebhookJob;
        try {
          job = webhookJobSchema.parse(unwrapConnectJson(JSON.parse(raw)));
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.error('Permanent invalid webhook job', {
            error: errorMessage,
            partition,
            offset: message.offset,
          });
          await this.publishDlq({
            reason: 'INVALID_JOB',
            errorMessage,
            raw,
            topic,
            partition,
            offset: message.offset,
          });
          return;
        }

        await this.handleMessage(
          job,
          topic,
          {
            partition,
            offset: message.offset,
          },
          heartbeat,
        );
      },
    });

    this.logger.log('Webhook Kafka consumer started');
  }

  async onModuleDestroy() {
    try {
      if (this.consumer) {
        await this.consumer.disconnect();
      }
    } catch (error) {
      this.logger.error('Error disconnecting webhook consumer', error);
    }
  }

  private async handleMessage(
    job: WebhookJob,
    topic: string,
    kafkaMeta: { partition: number; offset: string },
    heartbeat: () => Promise<void>,
  ): Promise<void> {
    const claim = await this.inboxRepository.claim(
      {
        consumerId: KafkaConsumerId.WEBHOOK_PROCESSING,
        eventId: `webhook:${job.eventId}`,
      },
      { topic, payload: job as unknown as JsonValue, kafkaMeta },
    );
    if (claim.outcome !== 'CLAIMED') {
      this.logger.log('Webhook inbox delivery skipped', {
        eventId: job.eventId,
        inboxId: claim.message.id,
        reason: claim.outcome,
      });
      return;
    }
    await this.runClaimed(job, claim, heartbeat);
  }

  @Interval(INBOX_RETRY_SWEEP_INTERVAL_MS)
  async retryDueMessages(): Promise<void> {
    if (!this.consumer) {
      return;
    }
    const claims = await this.inboxRepository.claimDue(
      KafkaConsumerId.WEBHOOK_PROCESSING,
      INBOX_RETRY_BATCH_SIZE,
    );
    for (const claim of claims) {
      const job = webhookJobSchema.parse(claim.message.payload);
      await this.runClaimed(job, claim, async () => undefined);
    }
  }

  private async runClaimed(
    job: WebhookJob,
    claim: ClaimedInbox,
    heartbeat: () => Promise<void>,
  ): Promise<void> {
    const outcome = await this.inboxProcessor.run(
      claim,
      () => this.processWithRetry(job, heartbeat),
      (error) => this.publishApplyFailure(job, claim, error),
    );
    this.logger.log('Webhook inbox claim finished', {
      eventId: job.eventId,
      inboxId: claim.message.id,
      outcome,
    });
  }

  private async publishApplyFailure(
    job: WebhookJob,
    claim: ClaimedInbox,
    error: unknown,
  ): Promise<void> {
    const diagnostics = errorLogContext(error);
    this.logger.error('Webhook apply failed permanently', {
      event: WEBHOOK_LOG_EVENTS.APPLY_FAILED,
      eventId: job.eventId,
      webhookEventId: job.webhookEventId,
      reference: job.reference,
      correlationId: job.correlationId,
      webhookRequestCorrelationId: job.webhookRequestCorrelationId,
      webhookEventType: job.event,
      inboxId: claim.message.id,
      partition: claim.message.partition,
      offset: claim.message.offset,
      diagnostics,
    });
    await this.publishDlq(
      {
        reason: 'APPLY_FAILED',
        eventId: job.eventId,
        webhookEventId: job.webhookEventId,
        reference: job.reference,
        event: job.event,
        inboxId: claim.message.id,
        partition: claim.message.partition,
        offset: claim.message.offset,
        diagnostics,
      },
      job.eventId,
    );
  }

  private async processWithRetry(
    job: WebhookJob,
    heartbeat: () => Promise<void>,
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.webhookService.applyWebhookJob(job);
        return;
      } catch (error) {
        if (!isRetryableError(error)) {
          throw error;
        }
        this.logger.warn('Transient webhook apply failure', {
          event: WEBHOOK_LOG_EVENTS.APPLY_FAILED,
          eventId: job.eventId,
          reference: job.reference,
          webhookEventId: job.webhookEventId,
          correlationId: job.correlationId,
          webhookRequestCorrelationId: job.webhookRequestCorrelationId,
          webhookEventType: job.event,
          attempt,
          maxRetries: MAX_RETRIES,
          diagnostics: errorLogContext(error),
        });
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_RETRIES) {
          await heartbeat();
          await sleep(fullJitterDelayMs(attempt));
          await heartbeat();
        }
      }
    }

    throw lastError ?? new Error('Webhook processing exhausted retries');
  }

  private async publishDlq(
    value: Record<string, unknown>,
    key?: string,
  ): Promise<void> {
    await this.kafkaService.produce(WebhookTopic.DLQ, {
      key,
      value,
    });
  }
}
