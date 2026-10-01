import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { AccountService } from '@/ledger/account.service';
import { LedgerService } from '@/ledger/ledger.service';
import { LedgerRepository } from '@database/repository/ledger.repository';
import { AuditService } from '@/audit/audit.service';
import { DatabaseService } from '@/database/database.service';
import { TransferRepository } from '@database/repository/transfer.repository';
import { TRANSFER_RECONCILIATION_REASON } from '@/transfer/provider-events/transfer-money.guards';
import {
  AccountSubtype,
  ActorType,
  EntryDirection,
  LedgerSourceType,
  PaymentStatus,
  TransactionStatus,
} from '@/utils/database.enums';
import { PermanentError, TransientError } from '@/kafka/retry-with-jitter';
import {
  TransferLogEvents,
  logTransfer,
} from '@/transfer/observability/transfer-log.events';
import {
  TRANSFER_LOG_STAGE,
  sanitizeErrorMessage,
} from '@/transfer/observability/transfer-log.context';
import {
  TransferSettlementResult,
  TransferSettlementSource,
} from '@/transfer/settlement/transfer-settlement.constants';
import type { Payment } from '@/database/database.types';

export type SettleTransferInput = {
  paymentId: string;
  reference: string;
  correlationId: string;
  source: TransferSettlementSource;
};

export {
  TransferSettlementResult,
  TransferSettlementSource,
} from '@/transfer/settlement/transfer-settlement.constants';

/**
 * Shared settlement for transfer.success webhook and BullMQ verify recovery.
 * Idempotent via `${reference}-settle` and settlementLedgerTransactionId predicate.
 * Amount and currency always come from the locked payment row.
 */
@Injectable()
export class TransferSettlementService {
  private readonly logger = new Logger(TransferSettlementService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly accountService: AccountService,
    private readonly ledgerService: LedgerService,
    private readonly ledgerRepository: LedgerRepository,
    private readonly transferRepository: TransferRepository,
    private readonly auditService: AuditService,
  ) {}

  async settle(input: SettleTransferInput): Promise<TransferSettlementResult> {
    try {
      const transaction = await this.transferRepository.findByReference(
        input.reference,
      );
      if (!transaction?.paymentId) {
        throw new TransientError(
          `Transaction not found for transfer settlement: ${input.reference}`,
        );
      }
      if (transaction.paymentId !== input.paymentId) {
        throw new PermanentError(
          `${TRANSFER_RECONCILIATION_REASON.PAYMENT_TRANSACTION_MISMATCH}: ${input.reference}`,
        );
      }

      const outcome = await this.db.transaction().execute(async (dbTx) => {
        const lockedPayment =
          await this.transferRepository.findPaymentByIdForUpdate(
            input.paymentId,
            dbTx,
          );
        if (!lockedPayment) {
          throw new TransientError(`Payment disappeared: ${input.paymentId}`);
        }

        if (lockedPayment.settlementLedgerTransactionId) {
          return {
            applied: false as const,
            lockedPayment,
            settlementId: lockedPayment.settlementLedgerTransactionId,
          };
        }

        if (
          lockedPayment.status === PaymentStatus.FAILED ||
          lockedPayment.status === PaymentStatus.REVERSAL_PENDING ||
          lockedPayment.reversalLedgerTransactionId
        ) {
          throw new PermanentError(
            `${TRANSFER_RECONCILIATION_REASON.SUCCESS_AFTER_TERMINAL_STATE}: ${lockedPayment.status} for ${input.reference}`,
          );
        }

        if (lockedPayment.status === PaymentStatus.COMPLETED) {
          return {
            applied: false as const,
            lockedPayment,
            settlementId: lockedPayment.settlementLedgerTransactionId,
          };
        }

        if (!lockedPayment.externalReference) {
          await this.transferRepository.markProviderAccepted(
            lockedPayment.id,
            input.reference,
            dbTx,
          );
        }

        const [suspenseAccount, providerBalance] = await Promise.all([
          this.accountService.findProviderPostingAccount(
            AccountSubtype.OUTBOUND_SUSPENSE,
            lockedPayment.provider,
            lockedPayment.currency,
            dbTx,
          ),
          this.accountService.findProviderPostingAccount(
            AccountSubtype.PROVIDER_PREFUNDED_BALANCE,
            lockedPayment.provider,
            lockedPayment.currency,
            dbTx,
          ),
        ]);
        if (!suspenseAccount || !providerBalance) {
          throw new TransientError('Settlement accounts missing');
        }

        const settleAmount = BigInt(lockedPayment.amount);

        let settlementId: string;
        try {
          const settlement = await this.ledgerService.createTransaction(
            {
              reference: `${input.reference}-settle`,
              description: 'Transfer settlement',
              sourceType: LedgerSourceType.TRANSFER_SETTLEMENT,
              sourceId: lockedPayment.id,
              correlationId: input.correlationId,
              entries: [
                {
                  ledgerAccountId: suspenseAccount.id,
                  direction: EntryDirection.DEBIT,
                  amount: settleAmount,
                  description: 'Clear outbound suspense',
                },
                {
                  ledgerAccountId: providerBalance.id,
                  direction: EntryDirection.CREDIT,
                  amount: settleAmount,
                  description: 'Settlement float credit',
                },
              ],
            },
            dbTx,
          );
          settlementId = settlement.transaction.id;
        } catch (error) {
          if (!(error instanceof ConflictException)) {
            throw error;
          }
          const existing =
            await this.ledgerRepository.findTransactionByReference(
              `${input.reference}-settle`,
              dbTx,
            );
          if (!existing) {
            throw error;
          }
          settlementId = existing.id;
        }

        const settled = await this.transferRepository.updatePaymentSettlement(
          lockedPayment.id,
          settlementId,
          dbTx,
        );
        if (!settled) {
          const latest = await this.transferRepository.findPaymentById(
            lockedPayment.id,
            dbTx,
          );
          if (latest?.settlementLedgerTransactionId) {
            return {
              applied: false as const,
              lockedPayment: latest,
              settlementId: latest.settlementLedgerTransactionId,
            };
          }
          throw new PermanentError(
            `${TRANSFER_RECONCILIATION_REASON.SETTLEMENT_PREDICATE_LOST}: ${input.reference}`,
          );
        }

        await this.transferRepository.updateTransactionStatus(
          transaction.id,
          TransactionStatus.COMPLETED,
          dbTx,
        );

        await this.auditService.log(
          {
            actorType: ActorType.SYSTEM,
            action: 'TRANSFER_COMPLETED',
            resourceType: 'transaction',
            resourceId: transaction.id,
            correlationId: input.correlationId,
            changes: {
              after: {
                reference: input.reference,
                amount: lockedPayment.amount.toString(),
                currency: lockedPayment.currency,
              },
            },
          },
          dbTx,
        );

        return {
          applied: true as const,
          lockedPayment,
          settlementId,
        };
      });

      const settlementResult = outcome.applied
        ? TransferSettlementResult.APPLIED
        : TransferSettlementResult.ALREADY_APPLIED;

      this.logSettlementCompleted(input, outcome.lockedPayment, {
        settlementResult,
        settlementLedgerTransactionId: outcome.settlementId,
      });

      return settlementResult;
    } catch (error) {
      logTransfer(this.logger, TransferLogEvents.SETTLEMENT_FAILED, {
        stage: TRANSFER_LOG_STAGE.SETTLE,
        correlationId: input.correlationId,
        reference: input.reference,
        paymentId: input.paymentId,
        source: input.source,
        errorMessage: sanitizeErrorMessage(error),
      });
      throw error;
    }
  }

  private logSettlementCompleted(
    input: SettleTransferInput,
    lockedPayment: Payment,
    details: {
      settlementResult: TransferSettlementResult;
      settlementLedgerTransactionId?: string | null;
    },
  ): void {
    logTransfer(this.logger, TransferLogEvents.SETTLEMENT_COMPLETED, {
      stage: TRANSFER_LOG_STAGE.SETTLE,
      correlationId: input.correlationId,
      reference: input.reference,
      paymentId: input.paymentId,
      source: input.source,
      settlementResult: details.settlementResult,
      settlementLedgerTransactionId: details.settlementLedgerTransactionId,
      previousPaymentStatus: lockedPayment.status,
      nextPaymentStatus: PaymentStatus.COMPLETED,
    });
  }
}
