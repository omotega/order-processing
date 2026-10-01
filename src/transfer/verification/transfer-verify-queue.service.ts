import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { appConfig } from '@/config/config';
import { TransferVerifyService } from '@/transfer/verification/transfer-verify.service';
import {
  SETTLEMENT_VERIFY_FAST_DELAY_MS,
  TRANSFER_VERIFY_JOBS,
  TRANSFER_VERIFY_QUEUE_NAME,
  type SettlementVerifyJob,
} from '@/transfer/verification/transfer-verify-queue.constants';

/**
 * BullMQ delayed settle-verify for case 1 (missing transfer.success webhook).
 * Owns Queue + Worker; TransferVerifyService stays queue-agnostic.
 */
@Injectable()
export class TransferVerifyQueueService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TransferVerifyQueueService.name);
  private queue: Queue;
  private worker: Worker;

  constructor(private readonly transferVerifyService: TransferVerifyService) {}

  onModuleInit() {
    const connection = { url: appConfig.redisUrl };

    this.queue = new Queue(TRANSFER_VERIFY_QUEUE_NAME, { connection });

    this.worker = new Worker(
      TRANSFER_VERIFY_QUEUE_NAME,
      async (job) => {
        if (job.name !== TRANSFER_VERIFY_JOBS.SETTLEMENT_VERIFY) {
          return;
        }
        const data = job.data as SettlementVerifyJob;
        const result =
          await this.transferVerifyService.verifyAwaitingSettlement(data);

        if (result.action === 'REDELAY') {
          await this.enqueueSettlementVerify({
            paymentId: data.paymentId,
            reference: data.reference,
            attempt: data.attempt + 1,
            correlationId: data.correlationId,
            delayMs: result.delayMs,
          });
        }
      },
      { connection },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Settlement verify job ${job?.id} failed after ${job?.attemptsMade} attempts: ${error.message}`,
      );
    });

    this.logger.log('Transfer verify queue worker started');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    this.logger.log('Transfer verify queue worker stopped');
  }

  async enqueueSettlementVerify(input: {
    paymentId: string;
    reference: string;
    attempt: number;
    correlationId: string;
    delayMs?: number;
  }): Promise<void> {
    await this.queue.add(
      TRANSFER_VERIFY_JOBS.SETTLEMENT_VERIFY,
      {
        paymentId: input.paymentId,
        reference: input.reference,
        attempt: input.attempt,
        correlationId: input.correlationId,
      } satisfies SettlementVerifyJob,
      {
        delay: input.delayMs ?? SETTLEMENT_VERIFY_FAST_DELAY_MS,
        jobId: `settle-verify-${input.paymentId}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 500,
      },
    );
  }
}
