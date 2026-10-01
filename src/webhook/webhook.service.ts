import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { appConfig } from '@/config/config';
import { WebhookEventRepository } from '@database/repository/webhook-event.repository';
import { ProcessedWebhookRepository } from '@database/repository/processed-webhook.repository';
import {
  TransferProviderEventService,
  type TransferProviderEventResult,
} from '@/transfer';
import { DatabaseService } from '@/database/database.service';
import { OutboxRepository } from '@database/repository/outbox.repository';
import { newId } from '@/utils/id';
import type { DbExecutor } from '@/database/db-executor';
import type {
  JsonValue,
  NewOutboxMessage,
  NewWebhookEvent,
  ProcessedWebhook,
  WebhookEvent,
} from '@/database/database.types';
import { WebhookEventStatus, WebhookProvider } from '@/utils/database.enums';
import { WebhookTopic } from '@/kafka/kafka.topics';
import { KafkaService } from '@/kafka/kafka.service';
import { PermanentError, TransientError } from '@/kafka/retry-with-jitter';
import { errorSummary } from '@/common/errors/classified.error';
import type { WebhookJob } from '@/webhook/dto/webhook-job.schema';
import {
  isPaystackTransferEvent,
  type PaystackWebhookPayload,
} from '@/webhook/dto/webhook.validation';
import {
  TransferWebhookApplyResult,
  WEBHOOK_LOG_EVENTS,
  WebhookAcknowledgementOutcome,
  WebhookApplyResult,
  WebhookFailureReason,
  WebhookResponseStatus,
} from '@/webhook/webhook.constants';
/**
 * `processed_webhooks.processedAt` and `result` are written by the same UPDATE,
 * so the pair is either both unset (claimed, not yet applied) or both set.
 */
export type WebhookCompletion =
  | { processedAt: Date; result: JsonValue }
  | { processedAt: null; result: null };

export type WebhookAcceptedResponse = {
  status: WebhookResponseStatus;
  duplicate: boolean;
  conflict?: true;
  eventId: string;
  reference: string;
  webhookEventId?: string;
} & WebhookCompletion;

export type WebhookAcceptanceResult = {
  response: WebhookAcceptedResponse;
  logContext: {
    outcome: WebhookAcknowledgementOutcome;
    correlationId?: string;
    webhookEventId?: string;
    paymentId?: string;
  };
};

const NOT_YET_APPLIED: WebhookCompletion = { processedAt: null, result: null };

type WebhookPublishPayload = {
  topic: WebhookTopic;
  key: string;
  value: WebhookJob;
  outboxId: string;
};

function completionOf(row?: ProcessedWebhook): WebhookCompletion {
  return row?.processedAt && row.result !== null
    ? { processedAt: row.processedAt, result: row.result }
    : NOT_YET_APPLIED;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly webhookEventRepository: WebhookEventRepository,
    private readonly processedWebhookRepository: ProcessedWebhookRepository,
    private readonly transferProviderEvents: TransferProviderEventService,
    private readonly db: DatabaseService,
    private readonly outboxRepository: OutboxRepository,
    private readonly kafkaService: KafkaService,
  ) {}

  async verifySignature(payload: string, signature: string): Promise<boolean> {
    try {
      const expectedSignature = crypto
        .createHmac('sha512', appConfig.paystack.secretKey)
        .update(payload)
        .digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      );

      if (!isValid) {
        this.logger.debug('Signature mismatch', {
          received: signature.substring(0, 20) + '...',
          expected: expectedSignature.substring(0, 20) + '...',
          payloadLength: payload.length,
        });
      }

      return isValid;
    } catch (error) {
      this.logger.error('Signature verification error', {
        error: error instanceof Error ? error.message : String(error),
        signatureLength: signature?.length,
        payloadLength: payload?.length,
      });
      return false;
    }
  }

  async acceptPaystackWebhook(
    payload: PaystackWebhookPayload,
    signature: string,
    rawBody: string,
    webhookRequestCorrelationId: string,
  ): Promise<WebhookAcceptanceResult> {
    const processorId = WebhookProvider.PAYSTACK;
    const eventId = `${payload.event}:${String(payload.data.id)}`;
    const reference = payload.data.reference;
    const rawBodyHash = crypto
      .createHash('sha256')
      .update(rawBody)
      .digest('hex');

    const outcome = await this.db.transaction().execute(async (dbTx) => {
      const claim = await this.processedWebhookRepository.tryClaim(
        { processorId, eventId },
        dbTx,
      );
      if (claim === 'duplicate') {
        const acceptance = await this.duplicateResponse(
          processorId,
          eventId,
          reference,
          rawBodyHash,
          dbTx,
        );
        let republishWebhookEventId: string | undefined;
        if (
          acceptance.response.duplicate &&
          !acceptance.response.conflict &&
          acceptance.response.processedAt === null &&
          acceptance.response.webhookEventId
        ) {
          const priorEvent = await this.webhookEventRepository.findById(
            acceptance.response.webhookEventId,
            dbTx,
          );
          if (priorEvent && isPaystackTransferEvent(priorEvent.eventType)) {
            republishWebhookEventId = acceptance.response.webhookEventId;
          }
        }
        return { ...acceptance, republishWebhookEventId };
      }

      const { payment, transaction } =
        await this.transferProviderEvents.findForWebhookAcceptance(
          reference,
          dbTx,
        );

      const failureReason = !payment
        ? WebhookFailureReason.PAYMENT_NOT_FOUND
        : !transaction
          ? WebhookFailureReason.TRANSACTION_NOT_FOUND
          : transaction.paymentId !== payment.id
            ? WebhookFailureReason.PAYMENT_TRANSACTION_MISMATCH
            : undefined;

      if (failureReason) {
        const webhookEventId = newId();
        const receivedAt = new Date();

        await this.webhookEventRepository.create(
          {
            id: webhookEventId,
            provider: processorId,
            eventType: payload.event,
            externalReference: reference,
            payload: payload as unknown as JsonValue,
            signature,
            rawBodyHash,
            paymentId: payment?.id ?? null,
            status: WebhookEventStatus.FAILED,
            idempotencyKey: eventId,
            failureReason,
            processedAt: receivedAt,
            receivedAt,
            updatedAt: receivedAt,
          } as NewWebhookEvent,
          dbTx,
        );

        const completed = await this.processedWebhookRepository.markComplete(
          processorId,
          eventId,
          {
            outcome: WebhookAcknowledgementOutcome.UNKNOWN_REFERENCE,
            reference,
            reason: failureReason,
          },
          dbTx,
        );

        return {
          response: {
            status: WebhookResponseStatus.SUCCESS,
            duplicate: false,
            eventId,
            reference,
            webhookEventId,
            ...completionOf(completed),
          },
          logContext: {
            outcome: WebhookAcknowledgementOutcome.UNKNOWN_REFERENCE,
            correlationId: payment?.correlationId,
            webhookEventId,
            paymentId: payment?.id,
          },
        } satisfies WebhookAcceptanceResult;
      }

      const webhookEventId = newId();
      const receivedAt = new Date();
      await this.webhookEventRepository.create(
        {
          id: webhookEventId,
          provider: processorId,
          eventType: payload.event,
          externalReference: reference,
          payload: payload as unknown as JsonValue,
          signature,
          rawBodyHash,
          paymentId: payment.id,
          status: WebhookEventStatus.RECEIVED,
          idempotencyKey: eventId,
          failureReason: null,
          processedAt: null,
          receivedAt,
          updatedAt: receivedAt,
        } as NewWebhookEvent,
        dbTx,
      );

      if (!isPaystackTransferEvent(payload.event)) {
        const completed = await this.processedWebhookRepository.markComplete(
          processorId,
          eventId,
          {
            status: WebhookApplyResult.IGNORED_UNSUPPORTED,
            event: payload.event,
            reference,
          },
          dbTx,
        );
        await this.webhookEventRepository.updateStatus(
          webhookEventId,
          WebhookEventStatus.PROCESSED,
          { processedAt: receivedAt, paymentId: payment.id },
          dbTx,
        );
        return {
          response: {
            status: WebhookResponseStatus.SUCCESS,
            duplicate: false,
            eventId,
            reference,
            webhookEventId,
            ...completionOf(completed),
          },
          logContext: {
            outcome: WebhookAcknowledgementOutcome.IGNORED,
            correlationId: payment.correlationId,
            webhookEventId,
            paymentId: payment.id,
          },
        } satisfies WebhookAcceptanceResult;
      }

      const job: WebhookJob = {
        processorId,
        eventId,
        webhookEventId,
        event: payload.event,
        reference,
        payload,
        receivedAt: receivedAt.toISOString(),
        correlationId: payment.correlationId,
        webhookRequestCorrelationId,
      };

      const outboxId = newId();
      await this.outboxRepository.insert(
        {
          id: outboxId,
          topic: WebhookTopic.JOBS,
          key: reference,
          aggregateType: 'webhook_event',
          aggregateId: webhookEventId,
          schemaVersion: 1,
          payload: job as unknown as JsonValue,
          createdAt: receivedAt,
        } as NewOutboxMessage,
        dbTx,
      );

      return {
        response: {
          status: WebhookResponseStatus.SUCCESS,
          duplicate: false,
          eventId,
          reference,
          webhookEventId,
          ...NOT_YET_APPLIED,
        },
        logContext: {
          outcome: WebhookAcknowledgementOutcome.ACCEPTED,
          correlationId: payment.correlationId,
          webhookEventId,
          paymentId: payment.id,
        },
        publish: {
          topic: WebhookTopic.JOBS,
          key: reference,
          value: job,
          outboxId,
        },
      } satisfies WebhookAcceptanceResult & {
        publish: WebhookPublishPayload;
      };
    });

    if (outcome.publish) {
      await this.publishWebhookJob(outcome.publish, reference, eventId);
    } else if (
      'republishWebhookEventId' in outcome &&
      outcome.republishWebhookEventId
    ) {
      await this.republishWebhookJobFromOutbox(
        outcome.republishWebhookEventId,
        reference,
        eventId,
      );
    }

    return {
      response: outcome.response,
      logContext: outcome.logContext,
    };
  }

  async applyWebhookJob(job: WebhookJob): Promise<WebhookApplyResult> {
    const claim = await this.processedWebhookRepository.find(
      job.processorId,
      job.eventId,
    );
    if (!claim) {
      throw new TransientError(
        `processed_webhook claim not found: ${job.processorId}:${job.eventId}`,
      );
    }
    if (claim.processedAt) {
      return WebhookApplyResult.ALREADY_APPLIED;
    }

    const webhookEvent = await this.requireWebhookEvent(job);
    const preDispatchResult = await this.resolvePreDispatchOutcome(
      job,
      webhookEvent,
    );

    return preDispatchResult ?? this.applyTransferWebhook(job, webhookEvent);
  }

  private async requireWebhookEvent(job: WebhookJob): Promise<WebhookEvent> {
    const webhookEvent = await this.webhookEventRepository.findById(
      job.webhookEventId,
    );
    if (!webhookEvent) {
      throw new TransientError(
        `webhook_event not found: ${job.webhookEventId}`,
      );
    }

    return webhookEvent;
  }

  private async resolvePreDispatchOutcome(
    job: WebhookJob,
    webhookEvent: WebhookEvent,
  ): Promise<WebhookApplyResult | null> {
    if (webhookEvent.status === WebhookEventStatus.PROCESSED) {
      await this.finalizeWebhookApplication(
        job,
        webhookEvent,
        WebhookApplyResult.ALREADY_APPLIED,
      );
      return WebhookApplyResult.ALREADY_APPLIED;
    }

    if (!isPaystackTransferEvent(job.event)) {
      await this.finalizeWebhookApplication(
        job,
        webhookEvent,
        WebhookApplyResult.IGNORED_UNSUPPORTED,
      );
      return WebhookApplyResult.IGNORED_UNSUPPORTED;
    }

    return null;
  }

  private async applyTransferWebhook(
    job: WebhookJob,
    webhookEvent: WebhookEvent,
  ): Promise<TransferWebhookApplyResult> {
    await this.webhookEventRepository.updateStatus(
      webhookEvent.id,
      WebhookEventStatus.PROCESSING,
    );

    let result: TransferWebhookApplyResult;
    try {
      result = await this.dispatchTransferEvent(job);
    } catch (error) {
      await this.recordTransferApplyFailure(webhookEvent, error);
      throw error;
    }

    await this.finalizeWebhookApplication(job, webhookEvent, result);
    return result;
  }

  private async recordTransferApplyFailure(
    webhookEvent: WebhookEvent,
    error: unknown,
  ): Promise<void> {
    try {
      const failedEvent = await this.webhookEventRepository.updateStatus(
        webhookEvent.id,
        WebhookEventStatus.FAILED,
        {
          failureReason: errorSummary(error),
          retryCount: (webhookEvent.retryCount ?? 0) + 1,
        },
      );
      if (!failedEvent) {
        this.logger.error('Webhook event missing while recording failure', {
          webhookEventId: webhookEvent.id,
        });
      }
    } catch (statusError) {
      this.logger.error('Failed to record webhook application failure', {
        webhookEventId: webhookEvent.id,
        error:
          statusError instanceof Error
            ? statusError.message
            : String(statusError),
      });
    }
  }

  async getWebhookStatus(reference: string) {
    const events = await this.webhookEventRepository.findByReference(reference);
    return { reference, events };
  }

  /**
   * Replay for a redelivery of an already claimed event. A payload whose hash
   * differs from the stored delivery is answered immediately: its stored result
   * describes a different body, so it is never echoed back and never enqueued.
   */
  private async publishWebhookJob(
    publish: WebhookPublishPayload,
    reference: string,
    eventId: string,
  ): Promise<void> {
    try {
      await this.kafkaService.produce(publish.topic, {
        key: publish.key,
        value: publish.value as unknown as Record<string, unknown>,
        headers: { eventId: publish.outboxId },
      });
    } catch (error) {
      this.logger.error('Failed to publish webhook job to Kafka', {
        reference,
        eventId,
        outboxId: publish.outboxId,
        kafkaTopic: publish.topic,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async republishWebhookJobFromOutbox(
    webhookEventId: string,
    reference: string,
    eventId: string,
  ): Promise<void> {
    const outbox = await this.outboxRepository.findByAggregate(
      'webhook_event',
      webhookEventId,
    );
    if (!outbox) {
      this.logger.error('Outbox record missing for incomplete webhook claim', {
        reference,
        eventId,
        webhookEventId,
      });
      throw new TransientError(
        `Outbox record missing for webhook_event ${webhookEventId}`,
      );
    }

    await this.publishWebhookJob(
      {
        topic: WebhookTopic.JOBS,
        key: outbox.key,
        value: outbox.payload as unknown as WebhookJob,
        outboxId: outbox.id,
      },
      reference,
      eventId,
    );
  }

  private async duplicateResponse(
    processorId: WebhookProvider,
    eventId: string,
    reference: string,
    rawBodyHash: string,
    dbTx: DbExecutor,
  ): Promise<WebhookAcceptanceResult> {
    const [processed, priorEvent] = await Promise.all([
      this.processedWebhookRepository.find(processorId, eventId, dbTx),
      this.webhookEventRepository.findByIdempotencyKey(eventId, dbTx),
    ]);

    if (priorEvent && priorEvent.rawBodyHash !== rawBodyHash) {
      this.logger.error('Webhook identity conflict', {
        event: WEBHOOK_LOG_EVENTS.APPLY_FAILED,
        eventId,
        reference,
        webhookEventId: priorEvent.id,
        outcome: WebhookAcknowledgementOutcome.CONFLICT,
      });

      return {
        response: {
          status: WebhookResponseStatus.SUCCESS,
          duplicate: true,
          conflict: true,
          eventId,
          reference,
          webhookEventId: priorEvent.id,
          ...NOT_YET_APPLIED,
        },
        logContext: {
          outcome: WebhookAcknowledgementOutcome.CONFLICT,
          webhookEventId: priorEvent.id,
          paymentId: priorEvent.paymentId ?? undefined,
        },
      };
    }

    return {
      response: {
        status: WebhookResponseStatus.SUCCESS,
        duplicate: true,
        eventId,
        reference,
        webhookEventId: priorEvent?.id,
        ...completionOf(processed),
      },
      logContext: {
        outcome: WebhookAcknowledgementOutcome.DUPLICATE,
        webhookEventId: priorEvent?.id,
        paymentId: priorEvent?.paymentId ?? undefined,
      },
    };
  }

  private async dispatchTransferEvent(
    job: WebhookJob,
  ): Promise<TransferWebhookApplyResult> {
    switch (job.event) {
      case 'transfer.success':
        return this.handleTransferSuccess(job);
      case 'transfer.failed':
      case 'transfer.reversed':
        return this.handleTransferFailureOrReversal(job);
      default:
        return WebhookApplyResult.ALREADY_APPLIED;
    }
  }

  private async handleTransferSuccess(
    job: WebhookJob,
  ): Promise<TransferWebhookApplyResult> {
    const { reference, amount, currency } = job.payload.data;
    const result = await this.transferProviderEvents.applySuccess({
      reference,
      amount,
      currency,
      correlationId: job.correlationId,
    });
    const applied = this.toWebhookApplyResult(result);

    this.logger.log('Webhook apply settled transfer', {
      event: WEBHOOK_LOG_EVENTS.APPLY_COMPLETED,
      correlationId: job.correlationId,
      webhookRequestCorrelationId: job.webhookRequestCorrelationId,
      reference,
      webhookEventId: job.webhookEventId,
      paymentId:
        result.kind === 'APPLIED' || result.kind === 'ALREADY_APPLIED'
          ? result.paymentId
          : undefined,
      settlementResult: applied,
    });

    return applied;
  }

  private async handleTransferFailureOrReversal(
    job: WebhookJob,
  ): Promise<TransferWebhookApplyResult> {
    const { reference } = job.payload.data;
    const reason =
      job.payload.data.reason ??
      (job.event === 'transfer.reversed'
        ? 'Provider transfer reversed'
        : 'Provider transfer failed');

    const result = await this.transferProviderEvents.applyFailureOrReversal({
      reference,
      event: job.event,
      reason: String(reason),
      correlationId: job.correlationId,
    });
    return this.toWebhookApplyResult(result);
  }

  private toWebhookApplyResult(
    result: TransferProviderEventResult,
  ): TransferWebhookApplyResult {
    switch (result.kind) {
      case 'APPLIED':
        return WebhookApplyResult.APPLIED;
      case 'ALREADY_APPLIED':
        return WebhookApplyResult.ALREADY_APPLIED;
      case 'NOT_FOUND':
        throw new TransientError(result.message);
      case 'AMOUNT_MISMATCH':
      case 'CURRENCY_MISMATCH':
        throw new PermanentError(result.message);
      case 'REQUIRES_RECONCILIATION':
        throw new PermanentError(result.reason);
    }
  }

  /**
   * HTTP accept only claims processed_webhooks (processedAt null) and enqueues
   * the job. After Kafka applies transfer side effects (or skips/replays), mark
   * webhook_events PROCESSED and complete the processed_webhooks claim together.
   */
  private async finalizeWebhookApplication(
    job: WebhookJob,
    webhookEvent: WebhookEvent,
    result: WebhookApplyResult,
  ): Promise<void> {
    const processedAt = webhookEvent.processedAt ?? new Date();

    await this.db.transaction().execute(async (dbTx) => {
      const completedEvent = await this.webhookEventRepository.updateStatus(
        webhookEvent.id,
        WebhookEventStatus.PROCESSED,
        {
          processedAt,
          paymentId: webhookEvent.paymentId,
        },
        dbTx,
      );
      const completedClaim = await this.processedWebhookRepository.markComplete(
        job.processorId,
        job.eventId,
        {
          status: result,
          event: job.event,
          reference: job.reference,
        },
        dbTx,
      );
      if (!completedEvent || !completedClaim) {
        throw new TransientError(
          `Failed to finalize webhook application: ${job.eventId}`,
        );
      }
    });
  }
}
