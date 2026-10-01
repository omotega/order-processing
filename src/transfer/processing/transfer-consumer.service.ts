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
  transferJobSchema,
  type TransferJob,
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
import { TransferOrchestrator } from '@/transfer/processing/transfer-orchestrator.service';
import {
  TransferLogEvents,
  logTransfer,
} from '@/transfer/observability/transfer-log.events';
import { TRANSFER_LOG_STAGE } from '@/transfer/observability/transfer-log.context';
import { TransferRepository } from '@database/repository/transfer.repository';
import { TransferTopic } from '@/kafka/kafka.topics';
import { ProviderSubmitOutcome } from '@/transfer/processing/transfer-provider-outcome';
import { unwrapConnectJson } from '@/kafka/unwrap-connect-json';
import {
  fullJitterDelayMs,
  isRetryableError,
  sleep,
} from '@/kafka/retry-with-jitter';

const MAX_RETRIES = 3;

@Injectable()
export class TransferConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TransferConsumer.name);
  private consumer: Consumer | null = null;

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly orchestrator: TransferOrchestrator,
    private readonly inboxRepository: InboxRepository,
    private readonly inboxProcessor: InboxProcessor,
    private readonly transferRepository: TransferRepository,
  ) {}

  async onModuleInit() {
    await this.kafkaService.createTopic(TransferTopic.JOBS);
    this.consumer = this.kafkaService.createConsumer(
      KafkaConsumerId.TRANSFER_PROCESSING,
    );
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: TransferTopic.JOBS,
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const raw = message.value?.toString();
        if (!raw) {
          logTransfer(this.logger, TransferLogEvents.CONSUMER_EMPTY_MESSAGE, {
            stage: TRANSFER_LOG_STAGE.INBOX,
            component: 'TransferConsumer',
            operation: 'eachMessage',
          });
          return;
        }

        let job: TransferJob;
        try {
          job = transferJobSchema.parse(unwrapConnectJson(JSON.parse(raw)));
        } catch (error) {
          logTransfer(this.logger, TransferLogEvents.CONSUMER_INVALID_MESSAGE, {
            stage: TRANSFER_LOG_STAGE.INBOX,
            component: 'TransferConsumer',
            operation: 'eachMessage',
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
          return;
        }

        await this.handleMessage(job, topic, {
          partition,
          offset: message.offset,
        });
      },
    });

    this.logger.log('Transfer consumer started');
  }

  async onModuleDestroy() {
    try {
      if (this.consumer) {
        await this.consumer.disconnect();
      }
    } catch (error) {
      this.logger.error('Error disconnecting transfer consumer', error);
    }
  }

  private async handleMessage(
    job: TransferJob,
    topic: string,
    kafkaMeta: { partition: number; offset: string },
  ): Promise<void> {
    const claim = await this.inboxRepository.claim(
      {
        consumerId: KafkaConsumerId.TRANSFER_PROCESSING,
        eventId: `submit:${job.paymentId}`,
      },
      { topic, payload: job as unknown as JsonValue, kafkaMeta },
    );

    if (claim.outcome !== 'CLAIMED') {
      logTransfer(this.logger, TransferLogEvents.INBOX_SKIPPED, {
        stage: TRANSFER_LOG_STAGE.INBOX,
        inboxId: claim.message.id,
        paymentId: job.paymentId,
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
      KafkaConsumerId.TRANSFER_PROCESSING,
      INBOX_RETRY_BATCH_SIZE,
    );
    for (const claim of claims) {
      const job = transferJobSchema.parse(claim.message.payload);
      await this.runClaimed(job, claim);
    }
  }

  private async runClaimed(job: TransferJob, claim: ClaimedInbox) {
    const outcome = await this.inboxProcessor.run(claim, async () => {
      await this.processWithRetry(job);
    });
    const payment = await this.transferRepository.findPaymentById(
      job.paymentId,
    );
    logTransfer(this.logger, TransferLogEvents.INBOX_RUN_FINISHED, {
      stage: TRANSFER_LOG_STAGE.INBOX,
      inboxId: claim.message.id,
      correlationId: job.correlationId,
      reference: job.reference,
      paymentId: job.paymentId,
      outcome,
      paymentStatus: payment?.status,
    });
  }

  private async processWithRetry(job: TransferJob): Promise<{
    processingOutcome: ProviderSubmitOutcome;
  }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.orchestrator.processTransferJob(job);
      } catch (error) {
        if (!isRetryableError(error)) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
        logTransfer(this.logger, TransferLogEvents.CONSUMER_RETRY, {
          stage: TRANSFER_LOG_STAGE.INBOX,
          correlationId: job.correlationId,
          reference: job.reference,
          paymentId: job.paymentId,
          attempt,
          maxRetries: MAX_RETRIES,
          errorMessage: lastError.message,
        });

        if (attempt < MAX_RETRIES) {
          await sleep(fullJitterDelayMs(attempt));
        }
      }
    }

    logTransfer(this.logger, TransferLogEvents.CONSUMER_EXHAUSTED, {
      stage: TRANSFER_LOG_STAGE.INBOX,
      correlationId: job.correlationId,
      reference: job.reference,
      paymentId: job.paymentId,
      maxRetries: MAX_RETRIES,
      errorMessage: lastError?.message,
    });

    throw lastError ?? new Error('Transfer processing exhausted retries');
  }
}
