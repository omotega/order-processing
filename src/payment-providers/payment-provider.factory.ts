import { Injectable, Logger } from '@nestjs/common';
import { appConfig } from '@/config/config';
import { PaymentProvider } from '@/utils/database.enums';
import { IPaymentProviderAdapter } from '@/payment-providers/payment-provider.interface';
import { PaystackAdapter } from '@/payment-providers/paystack.adapter';
import {
  ProviderCircuitStore,
  CircuitState,
} from '@/payment-providers/provider-circuit.store';

export interface ProviderResolution {
  adapter: IPaymentProviderAdapter;
  provider: PaymentProvider;
  attempt: number;
  skippedProviders: PaymentProvider[];
  isFailover: boolean;
}

@Injectable()
export class PaymentProviderFactory {
  private readonly logger = new Logger(PaymentProviderFactory.name);
  private readonly adapters: Map<PaymentProvider, IPaymentProviderAdapter>;

  constructor(
    paystackAdapter: PaystackAdapter,
    private readonly circuitStore: ProviderCircuitStore,
  ) {
    this.adapters = new Map<PaymentProvider, IPaymentProviderAdapter>([
      [PaymentProvider.PAYSTACK, paystackAdapter],
    ]);
  }

  resolve(provider: PaymentProvider): IPaymentProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Unsupported payment provider: ${provider}`);
    }
    return adapter;
  }

  async resolveDefault(): Promise<IPaymentProviderAdapter> {
    const resolution = await this.resolveDefaultWithMeta();
    return resolution.adapter;
  }

  async resolveDefaultWithMeta(): Promise<ProviderResolution> {
    const { provider, attempt, skippedProviders } =
      await this.resolveActiveProviderWithMeta();

    return {
      adapter: this.resolve(provider),
      provider,
      attempt,
      skippedProviders,
      isFailover: attempt > 1,
    };
  }

  async resolveActiveProvider(): Promise<PaymentProvider> {
    const resolution = await this.resolveActiveProviderWithMeta();
    return resolution.provider;
  }

  private async resolveActiveProviderWithMeta(): Promise<{
    provider: PaymentProvider;
    attempt: number;
    skippedProviders: PaymentProvider[];
  }> {
    const skippedProviders: PaymentProvider[] = [];

    for (
      let index = 0;
      index < appConfig.paymentProviderPriority.length;
      index++
    ) {
      const provider = appConfig.paymentProviderPriority[index];
      const attempt = index + 1;
      const state = await this.circuitStore.getEffectiveState(provider);

      if (state === CircuitState.OPEN) {
        skippedProviders.push(provider);
        this.logger.warn('Payment provider skipped', {
          processor: provider,
          circuitState: CircuitState.OPEN,
          attempt,
          skippedCount: skippedProviders.length,
        });
        continue;
      }

      return { provider, attempt, skippedProviders };
    }

    throw new Error('All payment providers are unavailable');
  }

  async recordSuccess(provider: PaymentProvider): Promise<void> {
    await this.circuitStore.recordSuccess(provider);
  }

  async recordFailure(provider: PaymentProvider): Promise<void> {
    await this.circuitStore.recordFailure(provider);
  }
}
