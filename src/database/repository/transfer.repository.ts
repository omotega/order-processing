import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@/database/database.service';
import type { DbExecutor } from '@/database/db-executor';
import type {
  NewPayment,
  NewTransaction,
  Payment,
  Transaction,
} from '@/database/database.types';
import {
  PaymentProcessingStatus,
  PaymentStatus,
  TransactionStatus,
} from '@/utils/database.enums';
import { appConfig } from '@/config/config';

export type TransitionableSubmitStatus =
  | PaymentProcessingStatus.READY_FOR_SUBMISSION
  | PaymentProcessingStatus.SUBMITTING
  | PaymentProcessingStatus.UNKNOWN
  | PaymentProcessingStatus.AWAITING_SETTLEMENT;

@Injectable()
export class TransferRepository {
  constructor(private readonly db: DatabaseService) {}

  private executor(trx?: DbExecutor): DbExecutor {
    return trx ?? this.db;
  }

  findTransactionById(id: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('transactions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  createPayment(data: NewPayment, trx?: DbExecutor): Promise<Payment> {
    return this.executor(trx)
      .insertInto('payments')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  createTransaction(
    data: NewTransaction,
    trx?: DbExecutor,
  ): Promise<Transaction> {
    return this.executor(trx)
      .insertInto('transactions')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findByReference(reference: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('transactions')
      .selectAll()
      .where('reference', '=', reference)
      .executeTakeFirst();
  }

  async findPaymentWithTransactionByReference(
    reference: string,
    trx?: DbExecutor,
  ): Promise<{ payment: Payment; transaction: Transaction } | undefined> {
    return this.findPaymentWithTransaction(
      (query) => query.where('transactions.reference', '=', reference),
      trx,
    );
  }

  async findPaymentWithTransactionByPaymentId(
    paymentId: string,
    trx?: DbExecutor,
  ): Promise<{ payment: Payment; transaction: Transaction } | undefined> {
    return this.findPaymentWithTransaction(
      (query) => query.where('payments.id', '=', paymentId),
      trx,
    );
  }

  private async findPaymentWithTransaction(
    applyFilter: (
      query: ReturnType<TransferRepository['paymentWithTransactionBaseQuery']>,
    ) => ReturnType<TransferRepository['paymentWithTransactionBaseQuery']>,
    trx?: DbExecutor,
  ): Promise<{ payment: Payment; transaction: Transaction } | undefined> {
    const row = await applyFilter(
      this.paymentWithTransactionBaseQuery(trx),
    ).executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return this.mapPaymentWithTransactionRow(row);
  }

  private paymentWithTransactionBaseQuery(trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('transactions')
      .innerJoin('payments', 'payments.id', 'transactions.paymentId')
      .select([
        'transactions.id as transactionId',
        'transactions.userId as transactionUserId',
        'transactions.userAccountId as transactionUserAccountId',
        'transactions.paymentId as transactionPaymentId',
        'transactions.type as transactionType',
        'transactions.direction as transactionDirection',
        'transactions.amount as transactionAmount',
        'transactions.fee as transactionFee',
        'transactions.currency as transactionCurrency',
        'transactions.status as transactionStatus',
        'transactions.reference as transactionReference',
        'transactions.description as transactionDescription',
        'transactions.counterpartyName as transactionCounterpartyName',
        'transactions.counterpartyAccount as transactionCounterpartyAccount',
        'transactions.ledgerTransactionId as transactionLedgerTransactionId',
        'transactions.userLedgerEntryId as transactionUserLedgerEntryId',
        'transactions.metadata as transactionMetadata',
        'transactions.createdAt as transactionCreatedAt',
        'payments.id as paymentId',
        'payments.userId as paymentUserId',
        'payments.paymentReference as paymentPaymentReference',
        'payments.correlationId as paymentCorrelationId',
        'payments.amount as paymentAmount',
        'payments.netAmount as paymentNetAmount',
        'payments.feeAmount as paymentFeeAmount',
        'payments.currency as paymentCurrency',
        'payments.status as paymentStatus',
        'payments.processingStatus as paymentProcessingStatus',
        'payments.paymentMethod as paymentPaymentMethod',
        'payments.provider as paymentProvider',
        'payments.externalReference as paymentExternalReference',
        'payments.failureReason as paymentFailureReason',
        'payments.holdLedgerTransactionId as paymentHoldLedgerTransactionId',
        'payments.settlementLedgerTransactionId as paymentSettlementLedgerTransactionId',
        'payments.reversalLedgerTransactionId as paymentReversalLedgerTransactionId',
        'payments.providerClaimedAt as paymentProviderClaimedAt',
        'payments.nextRetryAt as paymentNextRetryAt',
        'payments.retryCount as paymentRetryCount',
        'payments.processedAt as paymentProcessedAt',
        'payments.requestHash as paymentRequestHash',
        'payments.beneficiaryId as paymentBeneficiaryId',
        'payments.metadata as paymentMetadata',
        'payments.createdAt as paymentCreatedAt',
        'payments.updatedAt as paymentUpdatedAt',
      ]);
  }

  private mapPaymentWithTransactionRow(row: {
    paymentId: string;
    paymentUserId: string;
    paymentPaymentReference: string;
    paymentCorrelationId: Payment['correlationId'];
    paymentAmount: Payment['amount'];
    paymentNetAmount: Payment['netAmount'];
    paymentFeeAmount: Payment['feeAmount'];
    paymentCurrency: Payment['currency'];
    paymentStatus: Payment['status'];
    paymentProcessingStatus: Payment['processingStatus'];
    paymentPaymentMethod: Payment['paymentMethod'];
    paymentProvider: Payment['provider'];
    paymentExternalReference: Payment['externalReference'];
    paymentFailureReason: Payment['failureReason'];
    paymentHoldLedgerTransactionId: Payment['holdLedgerTransactionId'];
    paymentSettlementLedgerTransactionId: Payment['settlementLedgerTransactionId'];
    paymentReversalLedgerTransactionId: Payment['reversalLedgerTransactionId'];
    paymentProviderClaimedAt: Payment['providerClaimedAt'];
    paymentNextRetryAt: Payment['nextRetryAt'];
    paymentRetryCount: Payment['retryCount'];
    paymentProcessedAt: Payment['processedAt'];
    paymentRequestHash: Payment['requestHash'];
    paymentBeneficiaryId: Payment['beneficiaryId'];
    paymentMetadata: Payment['metadata'];
    paymentCreatedAt: Payment['createdAt'];
    paymentUpdatedAt: Payment['updatedAt'];
    transactionId: string;
    transactionUserId: string;
    transactionUserAccountId: string;
    transactionPaymentId: string;
    transactionType: Transaction['type'];
    transactionDirection: Transaction['direction'];
    transactionAmount: Transaction['amount'];
    transactionFee: Transaction['fee'];
    transactionCurrency: Transaction['currency'];
    transactionStatus: Transaction['status'];
    transactionReference: string;
    transactionDescription: Transaction['description'];
    transactionCounterpartyName: Transaction['counterpartyName'];
    transactionCounterpartyAccount: Transaction['counterpartyAccount'];
    transactionLedgerTransactionId: Transaction['ledgerTransactionId'];
    transactionUserLedgerEntryId: Transaction['userLedgerEntryId'];
    transactionMetadata: Transaction['metadata'];
    transactionCreatedAt: Transaction['createdAt'];
  }): { payment: Payment; transaction: Transaction } {
    return {
      payment: {
        id: row.paymentId,
        userId: row.paymentUserId,
        paymentReference: row.paymentPaymentReference,
        correlationId: row.paymentCorrelationId,
        amount: row.paymentAmount,
        netAmount: row.paymentNetAmount,
        feeAmount: row.paymentFeeAmount,
        currency: row.paymentCurrency,
        status: row.paymentStatus,
        processingStatus: row.paymentProcessingStatus,
        paymentMethod: row.paymentPaymentMethod,
        provider: row.paymentProvider,
        externalReference: row.paymentExternalReference,
        failureReason: row.paymentFailureReason,
        holdLedgerTransactionId: row.paymentHoldLedgerTransactionId,
        settlementLedgerTransactionId: row.paymentSettlementLedgerTransactionId,
        reversalLedgerTransactionId: row.paymentReversalLedgerTransactionId,
        providerClaimedAt: row.paymentProviderClaimedAt,
        nextRetryAt: row.paymentNextRetryAt,
        retryCount: row.paymentRetryCount,
        processedAt: row.paymentProcessedAt,
        requestHash: row.paymentRequestHash,
        beneficiaryId: row.paymentBeneficiaryId,
        metadata: row.paymentMetadata,
        createdAt: row.paymentCreatedAt,
        updatedAt: row.paymentUpdatedAt,
      },
      transaction: {
        id: row.transactionId,
        userId: row.transactionUserId,
        userAccountId: row.transactionUserAccountId,
        paymentId: row.transactionPaymentId,
        type: row.transactionType,
        direction: row.transactionDirection,
        amount: row.transactionAmount,
        fee: row.transactionFee,
        currency: row.transactionCurrency,
        status: row.transactionStatus,
        reference: row.transactionReference,
        description: row.transactionDescription,
        counterpartyName: row.transactionCounterpartyName,
        counterpartyAccount: row.transactionCounterpartyAccount,
        ledgerTransactionId: row.transactionLedgerTransactionId,
        userLedgerEntryId: row.transactionUserLedgerEntryId,
        metadata: row.transactionMetadata,
        createdAt: row.transactionCreatedAt,
      },
    };
  }

  async createPaymentAndTransaction(
    payment: NewPayment,
    transaction: NewTransaction,
    trx?: DbExecutor,
  ) {
    const run = async (executor: DbExecutor) => {
      const createdPayment = await this.createPayment(payment, executor);
      const createdTransaction = await this.createTransaction(
        {
          ...transaction,
          paymentId: createdPayment.id,
        },
        executor,
      );

      return { payment: createdPayment, transaction: createdTransaction };
    };

    if (trx) {
      return run(trx);
    }

    return this.db.transaction().execute(run);
  }

  updatePaymentStatus(
    id: string,
    status: PaymentStatus,
    data: {
      externalReference?: string;
      failureReason?: string;
      processedAt?: Date;
      providerClaimedAt?: Date | null;
      nextRetryAt?: Date | null;
      holdLedgerTransactionId?: string;
      settlementLedgerTransactionId?: string | null;
      reversalLedgerTransactionId?: string | null;
    } = {},
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .updateTable('payments')
      .set({
        status,
        externalReference: data.externalReference,
        failureReason: data.failureReason ?? null,
        processedAt: data.processedAt ?? null,
        ...(data.providerClaimedAt !== undefined
          ? { providerClaimedAt: data.providerClaimedAt }
          : {}),
        ...(data.nextRetryAt !== undefined
          ? { nextRetryAt: data.nextRetryAt }
          : {}),
        ...(data.holdLedgerTransactionId !== undefined
          ? { holdLedgerTransactionId: data.holdLedgerTransactionId }
          : {}),
        ...(data.settlementLedgerTransactionId !== undefined
          ? {
              settlementLedgerTransactionId: data.settlementLedgerTransactionId,
            }
          : {}),
        ...(data.reversalLedgerTransactionId !== undefined
          ? { reversalLedgerTransactionId: data.reversalLedgerTransactionId }
          : {}),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  updatePaymentStatusFrom(
    id: string,
    from: PaymentStatus | PaymentStatus[],
    to: PaymentStatus,
    data: {
      externalReference?: string;
      failureReason?: string;
      processedAt?: Date;
      providerClaimedAt?: Date | null;
      nextRetryAt?: Date | null;
      holdLedgerTransactionId?: string;
      settlementLedgerTransactionId?: string | null;
      reversalLedgerTransactionId?: string | null;
    } = {},
    trx?: DbExecutor,
  ) {
    const fromStatuses = Array.isArray(from) ? from : [from];
    return this.executor(trx)
      .updateTable('payments')
      .set({
        status: to,
        ...(data.externalReference !== undefined
          ? { externalReference: data.externalReference }
          : {}),
        failureReason: data.failureReason ?? null,
        ...(data.processedAt !== undefined
          ? { processedAt: data.processedAt }
          : {}),
        ...(data.providerClaimedAt !== undefined
          ? { providerClaimedAt: data.providerClaimedAt }
          : {}),
        ...(data.nextRetryAt !== undefined
          ? { nextRetryAt: data.nextRetryAt }
          : {}),
        ...(data.holdLedgerTransactionId !== undefined
          ? { holdLedgerTransactionId: data.holdLedgerTransactionId }
          : {}),
        ...(data.settlementLedgerTransactionId !== undefined
          ? {
              settlementLedgerTransactionId: data.settlementLedgerTransactionId,
            }
          : {}),
        ...(data.reversalLedgerTransactionId !== undefined
          ? { reversalLedgerTransactionId: data.reversalLedgerTransactionId }
          : {}),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .where('status', 'in', fromStatuses)
      .returningAll()
      .executeTakeFirst();
  }

  updatePaymentSettlement(
    id: string,
    settlementLedgerTransactionId: string,
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .updateTable('payments')
      .set({
        status: PaymentStatus.COMPLETED,
        settlementLedgerTransactionId,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .where('settlementLedgerTransactionId', 'is', null)
      .where('reversalLedgerTransactionId', 'is', null)
      .where('status', '=', PaymentStatus.PENDING)
      .where('processingStatus', 'in', [
        PaymentProcessingStatus.SUBMITTING,
        PaymentProcessingStatus.UNKNOWN,
        PaymentProcessingStatus.AWAITING_SETTLEMENT,
      ])
      .returningAll()
      .executeTakeFirst();
  }

  updatePaymentReversal(
    id: string,
    reversalLedgerTransactionId: string,
    data: { failureReason?: string } = {},
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .updateTable('payments')
      .set({
        status: PaymentStatus.FAILED,
        reversalLedgerTransactionId,
        failureReason: data.failureReason ?? null,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .where('reversalLedgerTransactionId', 'is', null)
      .where('settlementLedgerTransactionId', 'is', null)
      .where('status', '=', PaymentStatus.REVERSAL_PENDING)
      .returningAll()
      .executeTakeFirst();
  }

  updateTransactionStatus(
    id: string,
    status: TransactionStatus,
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .updateTable('transactions')
      .set({ status })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Atomic claim before PSP submit. Only one worker can claim a READY state.
   * payment that has not been submitted and is not already claimed.
   */
  claimPaymentForSubmit(
    id: string,
    trx?: DbExecutor,
  ): Promise<Payment | undefined> {
    return this.executor(trx)
      .updateTable('payments')
      .set({
        processingStatus: PaymentProcessingStatus.SUBMITTING,
        providerClaimedAt: new Date(),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .where('status', '=', PaymentStatus.PENDING)
      .where('processingStatus', 'in', [
        PaymentProcessingStatus.READY_FOR_SUBMISSION,
        PaymentProcessingStatus.UNKNOWN,
      ])
      .where('externalReference', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  findPaymentById(id: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('payments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  findPaymentByIdForUpdate(id: string, trx: DbExecutor) {
    return trx
      .selectFrom('payments')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
  }

  findPaymentByTransactionId(transactionId: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('payments')
      .innerJoin('transactions', 'transactions.paymentId', 'payments.id')
      .where('transactions.id', '=', transactionId)
      .selectAll('payments')
      .executeTakeFirst();
  }

  findPaymentByReference(paymentReference: string, trx?: DbExecutor) {
    return this.executor(trx)
      .selectFrom('payments')
      .selectAll()
      .where('paymentReference', '=', paymentReference)
      .executeTakeFirst();
  }

  /** Payments needing verify worker attention. */
  findPaymentsNeedingVerification(limit = 50): Promise<Payment[]> {
    const leaseCutoff = new Date(
      Date.now() - appConfig.paymentProviderClaimLeaseSeconds * 1000,
    );

    return this.db
      .selectFrom('payments')
      .selectAll()
      .where((eb) =>
        eb.or([
          eb('status', '=', PaymentStatus.UNKNOWN),
          eb('processingStatus', '=', PaymentProcessingStatus.UNKNOWN),
          eb.and([
            eb('processingStatus', '=', PaymentProcessingStatus.SUBMITTING),
            eb('externalReference', 'is', null),
            eb('providerClaimedAt', 'is not', null),
            eb('providerClaimedAt', '<', leaseCutoff),
          ]),
          // Compatibility window for legacy rows claimed pre-cutover.
          eb.and([
            eb('status', '=', PaymentStatus.PENDING),
            eb('externalReference', 'is', null),
            eb('providerClaimedAt', 'is not', null),
            eb('providerClaimedAt', '<', leaseCutoff),
          ]),
        ]),
      )
      .orderBy('updatedAt', 'asc')
      .limit(limit)
      .execute();
  }

  findStuckReversalPending(
    olderThanMs: number,
    limit = 50,
  ): Promise<Payment[]> {
    const cutoff = new Date(Date.now() - olderThanMs);
    return this.db
      .selectFrom('payments')
      .selectAll()
      .where('status', '=', PaymentStatus.REVERSAL_PENDING)
      .where('updatedAt', '<', cutoff)
      .orderBy('updatedAt', 'asc')
      .limit(limit)
      .execute();
  }

  findReadyForSubmissionOlderThan(
    olderThanMs: number,
    limit = 50,
  ): Promise<Payment[]> {
    const cutoff = new Date(Date.now() - olderThanMs);
    return this.db
      .selectFrom('payments')
      .selectAll()
      .where(
        'processingStatus',
        '=',
        PaymentProcessingStatus.READY_FOR_SUBMISSION,
      )
      .where('updatedAt', '<', cutoff)
      .orderBy('updatedAt', 'asc')
      .limit(limit)
      .execute();
  }

  markProviderAccepted(
    id: string,
    externalReference: string,
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .updateTable('payments')
      .set({
        processingStatus: PaymentProcessingStatus.AWAITING_SETTLEMENT,
        externalReference,
        failureReason: null,
        nextRetryAt: null,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .where('processingStatus', 'in', [
        PaymentProcessingStatus.SUBMITTING,
        PaymentProcessingStatus.UNKNOWN,
      ])
      .returningAll()
      .executeTakeFirst();
  }

  markUnknownFromSubmitting(
    id: string,
    failureReason?: string,
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .updateTable('payments')
      .set({
        processingStatus: PaymentProcessingStatus.UNKNOWN,
        failureReason: failureReason ?? 'Submit outcome uncertain',
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .where('processingStatus', '=', PaymentProcessingStatus.SUBMITTING)
      .returningAll()
      .executeTakeFirst();
  }

  claimPaymentForVerification(
    id: string,
    leaseMs = 30_000,
  ): Promise<Payment | undefined> {
    const now = new Date();
    return this.db
      .updateTable('payments')
      .set({
        processingStatus: (eb) =>
          eb
            .case()
            .when('processingStatus', '=', PaymentProcessingStatus.SUBMITTING)
            .then(PaymentProcessingStatus.UNKNOWN)
            .else(eb.ref('processingStatus'))
            .end(),
        nextRetryAt: new Date(now.getTime() + leaseMs),
        retryCount: (eb) => eb('retryCount', '+', 1),
        updatedAt: now,
      })
      .where('id', '=', id)
      .where((eb) =>
        eb.or([eb('nextRetryAt', 'is', null), eb('nextRetryAt', '<=', now)]),
      )
      .where((eb) =>
        eb.or([
          eb('status', '=', PaymentStatus.UNKNOWN),
          eb('processingStatus', '=', PaymentProcessingStatus.UNKNOWN),
          eb.and([
            eb('processingStatus', '=', PaymentProcessingStatus.SUBMITTING),
            eb('externalReference', 'is', null),
            eb('providerClaimedAt', 'is not', null),
          ]),
          eb.and([
            eb('status', '=', PaymentStatus.PENDING),
            eb('externalReference', 'is', null),
            eb('providerClaimedAt', 'is not', null),
          ]),
        ]),
      )
      .returningAll()
      .executeTakeFirst();
  }

  requestReversal(
    id: string,
    reason: string,
    fromStatuses: readonly TransitionableSubmitStatus[],
    trx?: DbExecutor,
  ) {
    return this.executor(trx)
      .updateTable('payments')
      .set({
        status: PaymentStatus.REVERSAL_PENDING,
        failureReason: reason,
        nextRetryAt: null,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .where('processingStatus', 'in', fromStatuses)
      .where('status', '=', PaymentStatus.PENDING)
      .where('settlementLedgerTransactionId', 'is', null)
      .where('reversalLedgerTransactionId', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  scheduleNextVerification(id: string, delayMs: number) {
    return this.db
      .updateTable('payments')
      .set({
        nextRetryAt: new Date(Date.now() + delayMs),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .executeTakeFirst();
  }
}
