import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '@/database/database.service';
import { AccountRepository } from '@database/repository/account.repository';
import { AccountService } from '@/ledger/account.service';
import { LedgerService } from '@/ledger/ledger.service';
import { TransferRepository } from '@database/repository/transfer.repository';
import { LimitsService } from '@/limits/limits.service';
import { AuditService } from '@/audit/audit.service';
import type { TransferReverseJob } from '@/transfer/dto/transfer-job.schema';
import {
  AccountSubtype,
  ActorType,
  EntryDirection,
  LedgerSourceType,
  PaymentStatus,
  TransactionStatus,
} from '@/utils/database.enums';
import {
  TransferLogEvents,
  logTransfer,
} from '@/transfer/observability/transfer-log.events';
import { TRANSFER_LOG_STAGE } from '@/transfer/observability/transfer-log.context';
import { PermanentError, TransientError } from '@/kafka/retry-with-jitter';

@Injectable()
export class TransferReverseService {
  private readonly logger = new Logger(TransferReverseService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly accountRepository: AccountRepository,
    private readonly accountService: AccountService,
    private readonly ledgerService: LedgerService,
    private readonly transferRepository: TransferRepository,
    private readonly limitsService: LimitsService,
    private readonly auditService: AuditService,
  ) {}

  async processReverseJob(job: TransferReverseJob): Promise<void> {
    const payment = await this.transferRepository.findPaymentById(
      job.paymentId,
    );
    if (!payment) {
      throw new TransientError(
        `Payment not found for reverse: ${job.paymentId}`,
      );
    }

    if (payment.status === PaymentStatus.FAILED) {
      logTransfer(this.logger, TransferLogEvents.REVERSAL_COMPLETED, {
        stage: TRANSFER_LOG_STAGE.REVERSE,
        component: 'TransferReverseService',
        operation: 'processReverseJob',
        paymentId: payment.id,
        paymentStatus: PaymentStatus.FAILED,
        reason: 'ALREADY_FAILED',
        correlationId: job.correlationId,
        reference: job.reference,
      });
      return;
    }

    if (payment.status !== PaymentStatus.REVERSAL_PENDING) {
      logTransfer(this.logger, TransferLogEvents.PAYMENT_CLAIM_SKIPPED, {
        stage: TRANSFER_LOG_STAGE.REVERSE,
        paymentId: payment.id,
        paymentStatus: payment.status,
        reason: 'NOT_REVERSAL_PENDING',
        correlationId: job.correlationId,
        reference: job.reference,
      });
      return;
    }

    logTransfer(this.logger, TransferLogEvents.REVERSAL_STARTED, {
      stage: TRANSFER_LOG_STAGE.REVERSE,
      component: 'TransferReverseService',
      operation: 'processReverseJob',
      paymentId: payment.id,
      transactionId: job.transactionId,
      correlationId: job.correlationId,
      reference: job.reference,
      reason: job.reason,
    });

    const amount = BigInt(job.amount);

    try {
      const reversed = await this.db.transaction().execute(async (dbTx) => {
        const lockedPayment =
          await this.transferRepository.findPaymentByIdForUpdate(
            payment.id,
            dbTx,
          );
        if (!lockedPayment) {
          throw new TransientError(
            `Payment not found for reverse: ${payment.id}`,
          );
        }
        if (lockedPayment.status === PaymentStatus.FAILED) {
          return false;
        }
        if (lockedPayment.status !== PaymentStatus.REVERSAL_PENDING) {
          return false;
        }

        const userAccount = await this.accountRepository.findByUserIdForUpdate(
          job.userId,
          dbTx,
        );
        const suspenseAccount =
          await this.accountService.findProviderPostingAccount(
            AccountSubtype.OUTBOUND_SUSPENSE,
            lockedPayment.provider,
            lockedPayment.currency,
            dbTx,
            { forUpdate: true },
          );

        if (!userAccount || !suspenseAccount) {
          throw new PermanentError('Accounts missing for reverse');
        }

        const reverseLedger = await this.ledgerService.createTransaction(
          {
            // Deterministic reference makes duplicate reverse deliveries safe.
            reference: `REV-${job.reference}`,
            description: `Reversal: ${job.reason}`,
            sourceType: LedgerSourceType.TRANSFER_REVERSAL,
            sourceId: payment.id,
            correlationId: job.correlationId,
            reversalOfId:
              job.ledgerTransactionId ?? payment.holdLedgerTransactionId,
            entries: [
              {
                ledgerAccountId: suspenseAccount.id,
                direction: EntryDirection.DEBIT,
                amount,
                description: 'Reverse outbound suspense',
              },
              {
                ledgerAccountId: userAccount.id,
                direction: EntryDirection.CREDIT,
                amount,
                description: 'Refund user wallet',
              },
            ],
          },
          dbTx,
        );

        await this.transferRepository.updatePaymentReversal(
          payment.id,
          reverseLedger.transaction.id,
          { failureReason: job.reason },
          dbTx,
        );

        await this.transferRepository.updateTransactionStatus(
          job.transactionId,
          TransactionStatus.FAILED,
          dbTx,
        );

        await this.limitsService.releaseUsage(job.userId, amount, dbTx);
        return true;
      });

      if (!reversed) {
        logTransfer(this.logger, TransferLogEvents.REVERSAL_COMPLETED, {
          stage: TRANSFER_LOG_STAGE.REVERSE,
          paymentId: payment.id,
          transactionId: job.transactionId,
          reason: 'ALREADY_REVERSED_OR_NO_LONGER_PENDING',
          correlationId: job.correlationId,
          reference: job.reference,
        });
        return;
      }

      logTransfer(this.logger, TransferLogEvents.REVERSAL_COMPLETED, {
        stage: TRANSFER_LOG_STAGE.REVERSE,
        paymentId: payment.id,
        transactionId: job.transactionId,
        previousStatus: PaymentStatus.REVERSAL_PENDING,
        nextStatus: PaymentStatus.FAILED,
        paymentStatus: PaymentStatus.FAILED,
        transactionStatus: TransactionStatus.FAILED,
        correlationId: job.correlationId,
        reference: job.reference,
      });

      await this.auditService.log({
        actorType: ActorType.SYSTEM,
        actorId: job.userId,
        action: 'TRANSFER_REVERSED',
        resourceType: 'payment',
        resourceId: payment.id,
        changes: {
          after: {
            reference: job.reference,
            reason: job.reason,
          },
        },
      });
    } catch (error) {
      logTransfer(this.logger, TransferLogEvents.REVERSAL_FAILED, {
        stage: TRANSFER_LOG_STAGE.REVERSE,
        paymentId: payment.id,
        transactionId: job.transactionId,
        paymentStatus: PaymentStatus.REVERSAL_PENDING,
        correlationId: job.correlationId,
        reference: job.reference,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      await this.auditService.log({
        actorType: ActorType.SYSTEM,
        actorId: job.userId,
        action: 'TRANSFER_REVERSAL_FAILED',
        resourceType: 'payment',
        resourceId: payment.id,
        changes: {
          after: {
            reference: job.reference,
            error: error instanceof Error ? error.message : String(error),
          },
        },
      });

      throw error;
    }
  }
}
