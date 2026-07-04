import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import * as crypto from 'crypto';
import { appConfig } from '../config/config';
import { AccountService } from '../ledger/account.service';
import { LedgerService } from '../ledger/ledger.service';
import { WebhookEventRepository } from './webhook-event.repository';
import { TransferRepository } from '../banking/transfer.repository';
import { AuditService } from '../audit/audit.service';
import { nanoid } from 'nanoid';
import type { JsonValue, NewWebhookEvent } from '../database/database.types';
import {
  ActorType,
  EntryDirection,
  WebhookEventStatus,
  WebhookProvider,
} from '../utils/database.enums';

export enum WebhookEventType {
  TRANSFER_SUCCESS = 'transfer.success',
  TRANSFER_FAILED = 'transfer.failed',
  TRANSFER_REVERSED = 'transfer.reversed',
  CHARGE_SUCCESS = 'charge.success',
  CHARGE_FAILED = 'charge.failed',
}

export interface WebhookPayload {
  event: string;
  data: {
    reference: string;
    amount: number;
    currency: string;
    status: string;
    recipient?: {
      recipient_code: string;
      details: {
        account_number: string;
        bank_code: string;
        account_name: string;
      };
    };
    transfer?: {
      transfer_code: string;
      amount: number;
      currency: string;
      status: string;
      reason?: string;
    };
  };
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly WEBHOOK_PROCESSING_TTL = 24 * 60 * 60;

  constructor(
    private readonly redisService: RedisService,
    private readonly accountService: AccountService,
    private readonly ledgerService: LedgerService,
    private readonly webhookEventRepository: WebhookEventRepository,
    private readonly transferRepository: TransferRepository,
    private readonly auditService: AuditService,
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
        error: error.message,
        signatureLength: signature?.length,
        payloadLength: payload?.length,
      });
      return false;
    }
  }

  async processWebhook(
    payload: WebhookPayload,
    signature?: string,
  ): Promise<void> {
    const { event, data } = payload;
    const reference = data.reference;
    const idempotencyKey = `webhook:${event}:${reference}`;

    const existingDbEvent =
      await this.webhookEventRepository.findByIdempotencyKey(idempotencyKey);
    if (
      existingDbEvent &&
      existingDbEvent.status === WebhookEventStatus.PROCESSED
    ) {
      this.logger.warn('Webhook already processed in database', {
        event,
        reference,
        idempotencyKey,
      });
      return;
    }

    const isProcessed = await this.redisService.get(idempotencyKey);
    if (isProcessed) {
      this.logger.warn('Webhook already processed in Redis', {
        event,
        reference,
        idempotencyKey,
      });
      return;
    }

    let webhookEvent = existingDbEvent;
    if (!webhookEvent) {
      webhookEvent = await this.webhookEventRepository.create({
        id: nanoid(),
        provider: WebhookProvider.PAYSTACK,
        eventType: event,
        externalReference: reference,
        payload: payload as unknown as JsonValue,
        signature: signature ?? null,
        status: WebhookEventStatus.RECEIVED,
        idempotencyKey,
        failureReason: null,
        processedAt: null,
        updatedAt: new Date(),
      } as NewWebhookEvent);
    }

    await this.webhookEventRepository.updateStatus(
      webhookEvent.id,
      WebhookEventStatus.PROCESSING,
    );

    await this.redisService.set(
      idempotencyKey,
      'processing',
      this.WEBHOOK_PROCESSING_TTL,
    );

    try {
      switch (event) {
        case WebhookEventType.TRANSFER_SUCCESS:
          await this.handleTransferSuccess(data);
          break;
        case WebhookEventType.TRANSFER_FAILED:
          await this.handleTransferFailed(data);
          break;
        case WebhookEventType.TRANSFER_REVERSED:
          await this.handleTransferReversed(data);
          break;
        case WebhookEventType.CHARGE_SUCCESS:
          await this.handleChargeSuccess(data);
          break;
        case WebhookEventType.CHARGE_FAILED:
          await this.handleChargeFailed(data);
          break;
        default:
          this.logger.warn('Unhandled webhook event', { event, data });
      }

      await this.webhookEventRepository.updateStatus(
        webhookEvent.id,
        WebhookEventStatus.PROCESSED,
        { processedAt: new Date() },
      );

      await this.redisService.set(
        idempotencyKey,
        'processed',
        this.WEBHOOK_PROCESSING_TTL,
      );

      await this.auditService.log({
        actorType: ActorType.SYSTEM,
        action: 'WEBHOOK_PROCESSED',
        resourceType: 'webhook_event',
        resourceId: webhookEvent.id,
        after: { event, reference, status: data.status },
      });

      this.logger.log('Webhook processed successfully', {
        event,
        reference,
        status: data.status,
      });
    } catch (error) {
      await this.webhookEventRepository.updateStatus(
        webhookEvent.id,
        WebhookEventStatus.FAILED,
        {
          failureReason: error.message,
          retryCount: (webhookEvent.retryCount ?? 0) + 1,
        },
      );
      await this.redisService.del(idempotencyKey);
      throw error;
    }
  }

  private async handleTransferSuccess(
    data: WebhookPayload['data'],
  ): Promise<void> {
    const { reference, amount } = data;

    this.logger.log('Processing transfer success', { reference, amount });

    const transaction =
      await this.transferRepository.findByReference(reference);
    if (!transaction) {
      this.logger.warn('Transaction not found for transfer success', {
        reference,
      });
      return;
    }

    const suspenseAccount = await this.accountService.findByCode('2100-000');
    const settlementFloat = await this.accountService.findByCode('1301-000');

    if (suspenseAccount && settlementFloat) {
      await this.ledgerService.createTransaction({
        reference: `${reference}-settle`,
        description: 'Transfer settlement',
        entries: [
          {
            accountId: suspenseAccount.id,
            direction: EntryDirection.DEBIT,
            amount: BigInt(amount),
            description: 'Clear outbound suspense',
          },
          {
            accountId: settlementFloat.id,
            direction: EntryDirection.CREDIT,
            amount: BigInt(amount),
            description: 'Settlement float credit',
          },
        ],
      });
    }

    await this.auditService.log({
      actorType: ActorType.SYSTEM,
      action: 'TRANSFER_COMPLETED',
      resourceType: 'transaction',
      resourceId: transaction.id,
      after: { reference, amount },
    });
  }

  private async handleTransferFailed(
    data: WebhookPayload['data'],
  ): Promise<void> {
    const { reference, transfer } = data;

    this.logger.log('Processing transfer failure', {
      reference,
      failureReason: transfer?.reason,
    });

    const transaction =
      await this.transferRepository.findByReference(reference);
    if (!transaction) {
      return;
    }

    const userAccount = await this.accountService.findByUserId(
      transaction.userId,
    );
    const suspenseAccount = await this.accountService.findByCode('2100-000');

    if (userAccount && suspenseAccount) {
      await this.ledgerService.createTransaction({
        reference: `${reference}-reverse`,
        description: 'Transfer failure reversal',
        entries: [
          {
            accountId: suspenseAccount.id,
            direction: EntryDirection.DEBIT,
            amount: BigInt(transaction.amount),
            description: 'Reverse outbound suspense',
          },
          {
            accountId: userAccount.id,
            direction: EntryDirection.CREDIT,
            amount: BigInt(transaction.amount),
            description: 'Refund user wallet',
          },
        ],
      });
    }

    await this.auditService.log({
      actorType: ActorType.SYSTEM,
      action: 'TRANSFER_FAILED',
      resourceType: 'transaction',
      resourceId: transaction.id,
      after: { reference, failureReason: transfer?.reason },
    });
  }

  private async handleTransferReversed(
    data: WebhookPayload['data'],
  ): Promise<void> {
    const { reference, amount } = data;

    this.logger.log('Processing transfer reversal', { reference, amount });

    await this.handleTransferFailed(data);
  }

  private async handleChargeSuccess(
    data: WebhookPayload['data'],
  ): Promise<void> {
    const { reference, amount, currency } = data;

    this.logger.log('Processing charge success', {
      reference,
      amount,
      currency,
    });
  }

  private async handleChargeFailed(
    data: WebhookPayload['data'],
  ): Promise<void> {
    const { reference } = data;

    this.logger.log('Processing charge failure', { reference });
  }

  async getWebhookStatus(reference: string) {
    const events = await this.webhookEventRepository.findByReference(reference);
    return { reference, events };
  }
}
