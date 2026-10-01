import { Injectable } from '@nestjs/common';
import { TransferRepository } from '@database/repository/transfer.repository';
import { LimitsService } from '@/limits/limits.service';
import type { TransferDto } from '@/transfer/dto/transfer.validation';
import { TransferAcceptService } from '@/transfer/acceptance/transfer-accept.service';

@Injectable()
export class TransferService {
  constructor(
    private readonly transferRepository: TransferRepository,
    private readonly limitsService: LimitsService,
    private readonly transferAcceptService: TransferAcceptService,
  ) {}

  async validateTransferAmount(
    input: { amount: number },
    user: { id: string },
  ) {
    const amount = BigInt(input.amount);
    const snapshot = await this.limitsService.getTransferLimitSnapshot(user.id);

    const maxSendableCandidate =
      snapshot.singleTransferMax < snapshot.dailyRemaining
        ? snapshot.singleTransferMax
        : snapshot.dailyRemaining;
    const maxSendable = maxSendableCandidate > 0n ? maxSendableCandidate : 0n;

    const base = {
      requestedAmount: amount.toString(),
      maxSendable: maxSendable.toString(),
      singleTransferMax: snapshot.singleTransferMax.toString(),
      dailyTransferMax: snapshot.dailyTransferMax.toString(),
      dailyUsed: snapshot.dailyUsed.toString(),
      dailyRemaining: snapshot.dailyRemaining.toString(),
    };

    if (
      amount > snapshot.singleTransferMax ||
      amount > snapshot.dailyRemaining
    ) {
      return { allowed: false, reason: 'LIMIT' as const, ...base };
    }

    return { allowed: true, reason: null, ...base };
  }

  initiateAsyncTransfer(
    payload: TransferDto['body'],
    user: { id: string },
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.transferAcceptService.accept(
      payload,
      user,
      idempotencyKey,
      correlationId,
    );
  }

  async getTransferStatus(reference: string) {
    const transaction =
      await this.transferRepository.findByReference(reference);
    if (!transaction) {
      return null;
    }

    const payment = transaction.paymentId
      ? await this.transferRepository.findPaymentById(transaction.paymentId)
      : null;

    return {
      reference: transaction.reference,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      type: transaction.type,
      direction: transaction.direction,
      transactionStatus: transaction.status,
      paymentState: payment?.processingStatus ?? null,
      paymentStatus: payment?.status ?? null,
      provider: payment?.provider ?? null,
      counterpartyName: transaction.counterpartyName,
      counterpartyAccount: transaction.counterpartyAccount,
      externalReference: payment?.externalReference ?? null,
      failureReason: payment?.failureReason ?? null,
      createdAt: transaction.createdAt,
    };
  }
}
