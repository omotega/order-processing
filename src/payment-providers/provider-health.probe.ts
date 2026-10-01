import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { appConfig } from '@/config/config';
import { RedisService } from '@/redis/redis.service';
import { PaymentProviderFactory } from '@/payment-providers/payment-provider.factory';
import { ProviderCircuitStore } from '@/payment-providers/provider-circuit.store';

/**
 * Probe interval must match PAYMENT_PROVIDER_PROBE_INTERVAL_SECONDS default (300s).
 * Changing the env alone does not change this decorator value.
 */
@Injectable()
export class ProviderHealthProbe {
  private readonly logger = new Logger(ProviderHealthProbe.name);

  constructor(
    private readonly redis: RedisService,
    private readonly circuitStore: ProviderCircuitStore,
    private readonly factory: PaymentProviderFactory,
  ) {}

  @Interval(300_000)
  async tick() {
    // TODO(SYNC_DEBUG): restore provider health probe after Paystack bug is fixed.
    return;
    const lockKey = 'payment-provider:probe:lock';
    const lockTtl = appConfig.paymentProviderHealth.probeLockSeconds;
    const acquired = await this.redis.trySetNx(lockKey, '1', lockTtl);
    if (!acquired) {
      return;
    }

    for (const provider of appConfig.paymentProviderPriority) {
      const adapter = this.factory.resolve(provider);
      if (!adapter.ping) {
        continue;
      }

      try {
        const ok = await adapter.ping();
        if (ok) {
          await this.circuitStore.recordSuccess(provider);
        } else {
          await this.circuitStore.recordFailure(provider);
        }
      } catch (error) {
        this.logger.warn(`Probe failed for ${provider}`, error as Error);
        await this.circuitStore.recordFailure(provider);
      }
    }
  }
}
