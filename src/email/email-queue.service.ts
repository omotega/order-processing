import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { appConfig } from '@/config/config';
import {
  EMAIL_JOBS,
  EMAIL_QUEUE_NAME,
  EMAIL_QUEUE_OPTIONS,
} from '@/email/constants/email-queue.constants';
import { ResendService } from '@/email/resend.service';
import { TemplateService } from '@/email/template.service';
import type { EmailJobPayload } from '@/email/types/email-job.types';

const REGISTRATION_OTP_EXPIRY_MINUTES = '10';

@Injectable()
export class EmailQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailQueueService.name);
  private queue: Queue;
  private worker: Worker;

  constructor(
    private readonly templateService: TemplateService,
    private readonly resendService: ResendService,
  ) {}

  onModuleInit() {
    const connection = { url: appConfig.redisUrl };

    this.queue = new Queue(EMAIL_QUEUE_NAME, { connection });

    this.worker = new Worker(
      EMAIL_QUEUE_NAME,
      async (job) => {
        const { template, to, subject, variables } =
          job.data as EmailJobPayload;
        const { html } = await this.templateService.render(template, variables);
        await this.resendService.send({ to, subject, html });
      },
      { connection },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Email job ${job?.id} failed after ${job?.attemptsMade} attempts: ${error.message}`,
      );
    });

    this.worker.on('completed', (job) => {
      const { template, to } = job.data as EmailJobPayload;
      this.logger.log(
        `Email job ${job.id} completed: sent "${template}" to ${to}`,
      );
    });

    this.logger.log('Email queue worker started');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    this.logger.log('Email queue worker stopped');
  }

  queueRegistrationOtp(payload: {
    to: string;
    firstName: string;
    otp: string;
  }) {
    void this.enqueueRegistrationOtp(payload).catch((error) => {
      this.logger.error(
        `Failed to queue registration OTP email for ${payload.to}`,
        error instanceof Error ? error.stack : error,
      );
    });
  }

  async enqueueSendEmail(payload: EmailJobPayload) {
    await this.queue.add(EMAIL_JOBS.SEND, payload, EMAIL_QUEUE_OPTIONS);
  }

  async enqueueRegistrationOtp({
    to,
    firstName,
    otp,
  }: {
    to: string;
    firstName: string;
    otp: string;
  }) {
    await this.enqueueSendEmail({
      template: 'registration-otp',
      to,
      subject: 'Verify your email address',
      variables: {
        firstName,
        otp,
        expiryMinutes: REGISTRATION_OTP_EXPIRY_MINUTES,
      },
    });
  }
}
