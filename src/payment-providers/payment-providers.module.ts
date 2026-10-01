import { Module } from '@nestjs/common';
import { PaymentProviderFactory } from '@/payment-providers/payment-provider.factory';
import { PaystackAdapter } from '@/payment-providers/paystack.adapter';
import { ProviderCircuitStore } from '@/payment-providers/provider-circuit.store';
import { ProviderHealthProbe } from '@/payment-providers/provider-health.probe';

@Module({
  providers: [
    PaystackAdapter,
    ProviderCircuitStore,
    ProviderHealthProbe,
    PaymentProviderFactory,
  ],
  exports: [PaymentProviderFactory],
})
export class PaymentProvidersModule {}
