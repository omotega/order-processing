import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { LimitsRepository } from './limits.repository';
import { DEFAULT_TIER_LIMITS, LimitType } from '../utils/database.enums';
import type { NewTransactionLimit } from '../database/database.types';
import { UserRepository } from '../auth/user.repository';

@Injectable()
export class LimitsService {
  constructor(
    private readonly limitsRepository: LimitsRepository,
    private readonly userRepository: UserRepository,
  ) {}

  private isPeriodExpired(periodStart: Date, limitType: LimitType): boolean {
    const now = Date.now();
    const start = periodStart.getTime();

    if (limitType === LimitType.MONTHLY_INBOUND) {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return start < monthAgo.getTime();
    }

    const dayAgo = now - 24 * 60 * 60 * 1000;
    return start < dayAgo;
  }

  async ensureTierLimits(kycTier: number) {
    const defaults = DEFAULT_TIER_LIMITS[kycTier] ?? DEFAULT_TIER_LIMITS[0];

    for (const [limitType, maxAmount] of Object.entries(defaults)) {
      const existing = await this.limitsRepository.findByTierAndType(
        kycTier,
        limitType as LimitType,
      );

      if (!existing) {
        await this.limitsRepository.create({
          id: nanoid(),
          userId: null,
          kycTier,
          limitType: limitType as LimitType,
          maxAmount,
          updatedAt: new Date(),
        } as NewTransactionLimit);
      }
    }
  }

  async getEffectiveLimit(userId: string, limitType: LimitType) {
    const userOverride = await this.limitsRepository.findByUserAndType(
      userId,
      limitType,
    );
    if (userOverride) {
      return userOverride;
    }

    const user = await this.userRepository.findByIdWithPassword(userId);
    const tier = user?.kycTier ?? 0;
    await this.ensureTierLimits(tier);

    return this.limitsRepository.findByTierAndType(tier, limitType);
  }

  async assertWithinLimits(userId: string, amount: bigint) {
    await this.assertLimit(userId, LimitType.SINGLE_TRANSFER, amount);
    await this.assertLimit(userId, LimitType.DAILY_TRANSFER, amount);
  }

  private async assertLimit(
    userId: string,
    limitType: LimitType,
    amount: bigint,
  ) {
    const limit = await this.getEffectiveLimit(userId, limitType);
    if (!limit) {
      return;
    }

    let currentUsage = BigInt(limit.currentUsage);
    if (this.isPeriodExpired(limit.periodStart, limitType)) {
      const reset = await this.limitsRepository.resetPeriod(limit.id);
      currentUsage = reset ? 0n : currentUsage;
    }

    const maxAmount = BigInt(limit.maxAmount);

    if (limitType === LimitType.SINGLE_TRANSFER && amount > maxAmount) {
      throw new UnprocessableEntityException(
        `Transfer amount exceeds single transfer limit of ${maxAmount}`,
      );
    }

    if (currentUsage + amount > maxAmount) {
      throw new UnprocessableEntityException(
        `Transfer would exceed ${limitType} limit of ${maxAmount}`,
      );
    }
  }

  async recordUsage(userId: string, amount: bigint) {
    for (const limitType of [
      LimitType.DAILY_TRANSFER,
      LimitType.SINGLE_TRANSFER,
    ]) {
      const limit = await this.getEffectiveLimit(userId, limitType);
      if (!limit || limitType === LimitType.SINGLE_TRANSFER) {
        continue;
      }

      if (this.isPeriodExpired(limit.periodStart, limitType)) {
        await this.limitsRepository.resetPeriod(limit.id);
      }

      await this.limitsRepository.incrementUsage(limit.id, amount);
    }
  }
}
