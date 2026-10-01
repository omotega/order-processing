import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { newId } from '@/utils/id';
import { LimitsRepository } from '@database/repository/limits.repository';
import { DEFAULT_TIER_LIMITS, LimitType } from '@/utils/database.enums';
import type {
  LimitPolicy,
  LimitUsage,
  NewLimitPolicy,
  NewLimitUsage,
} from '@/database/database.types';
import type { DbExecutor } from '@/database/db-executor';
import { UserRepository } from '@database/repository/user.repository';
import { LIMITS_ERRORS } from '@/common/errors/index';

export type EffectiveLimit = {
  policy: LimitPolicy;
  usage: LimitUsage;
  maxAmount: bigint;
  reservedAmount: bigint;
  consumedAmount: bigint;
  currentUsage: bigint;
  periodStart: Date;
  periodEnd: Date;
};

@Injectable()
export class LimitsService {
  constructor(
    private readonly limitsRepository: LimitsRepository,
    private readonly userRepository: UserRepository,
  ) {}

  private startOfUtcDay(date = new Date()): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private periodBounds(now = new Date()): {
    periodStart: Date;
    periodEnd: Date;
  } {
    const periodStart = this.startOfUtcDay(now);
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);
    return { periodStart, periodEnd };
  }

  async ensureTierLimits(kycTier: number, trx?: DbExecutor) {
    const defaults = DEFAULT_TIER_LIMITS[kycTier] ?? DEFAULT_TIER_LIMITS[0];

    for (const [limitType, maxAmount] of Object.entries(defaults)) {
      const existing = await this.limitsRepository.findPolicyByTierAndType(
        kycTier,
        limitType as LimitType,
        'NGN',
        trx,
      );

      if (!existing) {
        await this.limitsRepository.createPolicyIfMissing(
          {
            id: newId(),
            kycTier,
            limitType: limitType as LimitType,
            maxAmount,
            currency: 'NGN',
            updatedAt: new Date(),
          } as NewLimitPolicy,
          trx,
        );
      }
    }
  }

  async getEffectiveLimit(
    userId: string,
    limitType: LimitType,
    trx?: DbExecutor,
  ): Promise<EffectiveLimit | undefined> {
    const user = await this.userRepository.findByIdWithPassword(userId, trx);
    const tier = user?.kycTier ?? 0;
    await this.ensureTierLimits(tier, trx);

    const policy = await this.limitsRepository.findPolicyByTierAndType(
      tier,
      limitType,
      'NGN',
      trx,
    );
    if (!policy) {
      return undefined;
    }

    const now = new Date();
    const { periodStart, periodEnd } = this.periodBounds(now);

    let usage = await this.limitsRepository.findCurrentUsage(
      userId,
      limitType,
      now,
      'NGN',
      trx,
    );

    if (!usage) {
      await this.limitsRepository.createUsageIfMissing(
        {
          id: newId(),
          userId,
          limitType,
          periodStart,
          periodEnd,
          reservedAmount: 0n,
          consumedAmount: 0n,
          currency: 'NGN',
          updatedAt: new Date(),
        } as NewLimitUsage,
        trx,
      );
      usage = await this.limitsRepository.findUsageForPeriod(
        userId,
        limitType,
        periodStart,
        'NGN',
        trx,
      );
    }

    if (!usage) {
      return undefined;
    }

    const reservedAmount = BigInt(usage.reservedAmount);
    const consumedAmount = BigInt(usage.consumedAmount);

    return {
      policy,
      usage,
      maxAmount: BigInt(policy.maxAmount),
      reservedAmount,
      consumedAmount,
      currentUsage: reservedAmount + consumedAmount,
      periodStart: new Date(usage.periodStart),
      periodEnd: new Date(usage.periodEnd),
    };
  }

  async getTransferLimitSnapshot(userId: string) {
    const single = await this.getEffectiveLimit(
      userId,
      LimitType.SINGLE_TRANSFER,
    );
    const daily = await this.getEffectiveLimit(
      userId,
      LimitType.DAILY_TRANSFER,
    );

    const dailyUsed = daily ? daily.currentUsage : 0n;
    const singleTransferMax = single ? single.maxAmount : 0n;
    const dailyTransferMax = daily ? daily.maxAmount : 0n;
    const dailyRemaining =
      dailyTransferMax > dailyUsed ? dailyTransferMax - dailyUsed : 0n;

    return {
      singleTransferMax,
      dailyTransferMax,
      dailyUsed,
      dailyRemaining,
    };
  }

  async assertWithinLimits(userId: string, amount: bigint, trx?: DbExecutor) {
    await this.assertLimit(userId, LimitType.SINGLE_TRANSFER, amount, trx);
    await this.assertLimit(userId, LimitType.DAILY_TRANSFER, amount, trx);
  }

  private async assertLimit(
    userId: string,
    limitType: LimitType,
    amount: bigint,
    trx?: DbExecutor,
  ) {
    const limit = await this.getEffectiveLimit(userId, limitType, trx);
    if (!limit) {
      return;
    }

    if (limitType === LimitType.SINGLE_TRANSFER && amount > limit.maxAmount) {
      throw new UnprocessableEntityException(
        LIMITS_ERRORS.SINGLE_TRANSFER_LIMIT_EXCEEDED,
      );
    }

    if (limit.currentUsage + amount > limit.maxAmount) {
      throw new UnprocessableEntityException(LIMITS_ERRORS.LIMIT_EXCEEDED);
    }
  }

  /** Assert + increment daily reserved usage inside the accept DB transaction. */
  async reserveUsage(userId: string, amount: bigint, trx?: DbExecutor) {
    await this.assertWithinLimits(userId, amount, trx);

    const limit = await this.getEffectiveLimit(
      userId,
      LimitType.DAILY_TRANSFER,
      trx,
    );
    if (!limit) {
      return;
    }

    await this.limitsRepository.incrementReserved(limit.usage.id, amount, trx);
  }

  async releaseUsage(userId: string, amount: bigint, trx?: DbExecutor) {
    const limit = await this.getEffectiveLimit(
      userId,
      LimitType.DAILY_TRANSFER,
      trx,
    );
    if (!limit) {
      return;
    }

    await this.limitsRepository.decrementReserved(limit.usage.id, amount, trx);
  }

  async recordUsage(userId: string, amount: bigint, trx?: DbExecutor) {
    await this.reserveUsage(userId, amount, trx);
  }
}
