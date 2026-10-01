import { Injectable, NotFoundException } from '@nestjs/common';
import { newId } from '@/utils/id';
import { SettlementRepository } from '@database/repository/settlement.repository';
import {
  CreateSettlementBatchDto,
  ReconcileBatchDto,
} from '@/settlement/dto/settlement.validation';
import {
  PaymentProvider,
  ReconciliationStatus,
  SettlementBatchStatus,
} from '@/utils/database.enums';
import { AuditService } from '@/audit/audit.service';
import { ActorType } from '@/utils/database.enums';
import { SETTLEMENT_ERRORS } from '@/common/errors/index';
import type {
  NewReconciliationItem,
  NewSettlementBatch,
} from '@/database/database.types';

@Injectable()
export class SettlementService {
  constructor(
    private readonly settlementRepository: SettlementRepository,
    private readonly auditService: AuditService,
  ) {}

  listBatches() {
    return this.settlementRepository.listBatches();
  }

  async createBatch(
    adminId: string,
    payload: CreateSettlementBatchDto['body'],
  ) {
    const batch = await this.settlementRepository.createBatch({
      id: newId(),
      provider: payload.provider as PaymentProvider,
      batchDate: new Date(payload.batchDate),
      totalAmount: BigInt(payload.totalAmount),
      status: SettlementBatchStatus.OPEN,
      externalBatchId: payload.externalBatchId,
      currency: 'NGN',
      closedAt: null,
      metadata: (payload.metadata ?? null) as NewSettlementBatch['metadata'],
      updatedAt: new Date(),
    } as NewSettlementBatch);

    await this.auditService.log({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'SETTLEMENT_BATCH_CREATED',
      resourceType: 'settlement_batch',
      resourceId: batch.id,
    });

    return batch;
  }

  async reconcileBatch(
    adminId: string,
    batchId: string,
    payload: ReconcileBatchDto['body'],
  ) {
    const batch = await this.settlementRepository.findBatchById(batchId);
    if (!batch) {
      throw new NotFoundException(SETTLEMENT_ERRORS.BATCH_NOT_FOUND);
    }

    let matched = 0;
    let discrepancies = 0;

    for (const item of payload.items) {
      const payment = await this.settlementRepository.findPaymentByReference(
        item.externalReference,
      );

      const expectedAmount = payment ? BigInt(payment.amount) : 0n;
      const actualAmount = BigInt(item.actualAmount);
      const isMatched = payment && expectedAmount === actualAmount;

      await this.settlementRepository.createReconciliationItem({
        id: newId(),
        settlementBatchId: batchId,
        paymentId: payment?.id ?? null,
        externalReference: item.externalReference,
        expectedAmount: payment ? expectedAmount : actualAmount,
        actualAmount,
        status: isMatched
          ? ReconciliationStatus.MATCHED
          : ReconciliationStatus.DISCREPANCY,
        discrepancyReason: isMatched
          ? null
          : payment
            ? 'Amount mismatch'
            : 'Payment not found',
        updatedAt: new Date(),
      } as unknown as NewReconciliationItem);

      if (isMatched && payment) {
        matched++;
      } else {
        discrepancies++;
      }
    }

    const status =
      discrepancies === 0
        ? SettlementBatchStatus.MATCHED
        : SettlementBatchStatus.DISCREPANCY;

    const updatedBatch = await this.settlementRepository.updateBatchStatus(
      batchId,
      status,
    );

    await this.auditService.log({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'SETTLEMENT_BATCH_RECONCILED',
      resourceType: 'settlement_batch',
      resourceId: batchId,
      changes: { after: { matched, discrepancies, status } },
    });

    return { batch: updatedBatch, matched, discrepancies };
  }

  getReconciliationItems(batchId: string) {
    return this.settlementRepository.findReconciliationByBatch(batchId);
  }
}
