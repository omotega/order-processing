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
  transferReverseJobSchema,
  type TransferReverseJob,
} from '@/transfer/dto/transfer-job.schema';
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
import type { JsonValue } from '@/database/database.types';
import { TransferReverseService } from '@/transfer/reversal/transfer-reverse.service';
import {
  TransferLogEvents,
  logTransfer,
} from '@/transfer/observability/transfer-log.events';
import { TRANSFER_LOG_STAGE } from '@/transfer/observability/transfer-log.context';
import { TransferTopic } from '@/kafka/kafka.topics';
import { unwrapConnectJson } from '@/kafka/unwrap-connect-json';
import {
  fullJitterDelayMs,
  isRetryableError,
  sleep,
} from '@/kafka/retry-with-jitter';

const MAX_RETRIES = 3;

@Injectable()
export class TransferReverseConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TransferReverseConsumer.name);
  private consumer: Consumer | null = null;

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly reverseService: TransferReverseService,
    private readonly inboxRepository: InboxRepository,
    private readonly inboxProcessor: InboxProcessor,
  ) {}

  async onModuleInit() {
    // TODO(SYNC_DEBUG): restore transfer.reverse consumer after Paystack bug is fixed.
    this.logger.warn('Transfer reverse consumer disabled (SYNC_DEBUG)');
    return;
    await this.kafkaService.createTopic(TransferTopic.REVERSE);
    this.consumer = this.kafkaService.createConsumer(
      KafkaConsumerId.TRANSFER_REVERSE,
    );
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: TransferTopic.REVERSE,
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const raw = message.value?.toString();
        if (!raw) {
          return;
        }

        let job: TransferReverseJob;
        try {
          job = transferReverseJobSchema.parse(
            unwrapConnectJson(JSON.parse(raw)),
          );
        } catch (error) {
          this.logger.error('Invalid reverse job message', {
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }

        await this.handleMessage(job, topic, {
          partition,
          offset: message.offset,
        });
      },
    });

    this.logger.log('Transfer reverse consumer started');
  }

  private async handleMessage(
    job: TransferReverseJob,
    topic: string,
    kafkaMeta: { partition: number; offset: string },
  ): Promise<void> {
    const claim = await this.inboxRepository.claim(
      {
        consumerId: KafkaConsumerId.TRANSFER_REVERSE,
        eventId: `reverse:${job.paymentId}:${job.reference}`,
      },
      { topic, payload: job as unknown as JsonValue, kafkaMeta },
    );
    if (claim.outcome !== 'CLAIMED') {
      logTransfer(this.logger, TransferLogEvents.INBOX_SKIPPED, {
        stage: TRANSFER_LOG_STAGE.INBOX,
        inboxId: claim.message.id,
        paymentId: job.paymentId,
        reference: job.reference,
        reason: claim.outcome,
      });
      return;
    }
    await this.runClaimed(job, claim);
  }

  @Interval(INBOX_RETRY_SWEEP_INTERVAL_MS)
  async retryDueMessages(): Promise<void> {
    if (!this.consumer) {
      return;
    }
    const claims = await this.inboxRepository.claimDue(
      KafkaConsumerId.TRANSFER_REVERSE,
      INBOX_RETRY_BATCH_SIZE,
    );
    for (const claim of claims) {
      const job = transferReverseJobSchema.parse(claim.message.payload);
      await this.runClaimed(job, claim);
    }
  }

  private async runClaimed(job: TransferReverseJob, claim: ClaimedInbox) {
    const outcome = await this.inboxProcessor.run(claim, () =>
      this.processWithRetry(job),
    );
    logTransfer(this.logger, TransferLogEvents.INBOX_RUN_FINISHED, {
      stage: TRANSFER_LOG_STAGE.INBOX,
      inboxId: claim.message.id,
      correlationId: job.correlationId,
      reference: job.reference,
      paymentId: job.paymentId,
      outcome,
      processingOutcome: 'REVERSED',
    });
  }

  private async processWithRetry(job: TransferReverseJob): Promise<void> {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.reverseService.processReverseJob(job);
        return;
      } catch (error) {
        lastError = error;
        if (!isRetryableError(error)) {
          throw error;
        }
        if (attempt < MAX_RETRIES) {
          await sleep(fullJitterDelayMs(attempt));
        }
      }
    }
    throw lastError ?? new Error('Reverse processing exhausted retries');
  }

  async onModuleDestroy() {
    try {
      if (this.consumer) {
        await this.consumer.disconnect();
      }
    } catch (error) {
      this.logger.error('Error disconnecting reverse consumer', error);
    }
  }
}
