import { Injectable, Logger } from '@nestjs/common';
import { appConfig } from '@/config/config';
import { RedisService } from '@/redis/redis.service';
import { PaymentProvider } from '@/utils/database.enums';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface ProviderCircuit {
  state: CircuitState;
  failureCount: number;
  openedAt: string | null;
}

@Injectable()
export class ProviderCircuitStore {
  private readonly logger = new Logger(ProviderCircuitStore.name);

  constructor(private readonly redis: RedisService) {}

  private key(provider: PaymentProvider) {
    return `payment-provider:circuit:${provider}`;
  }

  async get(provider: PaymentProvider): Promise<ProviderCircuit> {
    const cached = await this.redis.getJson<ProviderCircuit>(
      this.key(provider),
    );
    return (
      cached ?? {
        state: CircuitState.CLOSED,
        failureCount: 0,
        openedAt: null,
      }
    );
  }

  async save(provider: PaymentProvider, circuit: ProviderCircuit) {
    await this.redis.setJson(this.key(provider), circuit);
  }

  async getEffectiveState(provider: PaymentProvider): Promise<CircuitState> {
    const circuit = await this.get(provider);
    if (circuit.state !== CircuitState.OPEN || !circuit.openedAt) {
      return circuit.state;
    }

    const coolDownMs = appConfig.paymentProviderHealth.coolDownSeconds * 1000;
    const elapsed = Date.now() - new Date(circuit.openedAt).getTime();
    if (elapsed < coolDownMs) {
      return CircuitState.OPEN;
    }

    circuit.state = CircuitState.HALF_OPEN;
    await this.save(provider, circuit);
    this.logger.log(
      `Circuit ${provider}: ${CircuitState.OPEN} → ${CircuitState.HALF_OPEN} (cool-down elapsed)`,
    );
    return CircuitState.HALF_OPEN;
  }

  async recordSuccess(provider: PaymentProvider): Promise<void> {
    const prev = (await this.get(provider)).state;
    if (prev === CircuitState.CLOSED) {
      return;
    }

    await this.save(provider, {
      state: CircuitState.CLOSED,
      failureCount: 0,
      openedAt: null,
    });
    this.logger.log(`Circuit ${provider}: ${prev} → ${CircuitState.CLOSED}`);
  }

  async recordFailure(provider: PaymentProvider): Promise<void> {
    const circuit = await this.get(provider);
    const threshold = appConfig.paymentProviderHealth.failureThreshold;

    if (circuit.state === CircuitState.OPEN) {
      return;
    }

    if (circuit.state === CircuitState.HALF_OPEN) {
      await this.save(provider, {
        state: CircuitState.OPEN,
        failureCount: threshold,
        openedAt: new Date().toISOString(),
      });
      this.logger.warn(
        `Circuit ${provider}: ${CircuitState.HALF_OPEN} → ${CircuitState.OPEN}`,
      );
      return;
    }

    const failureCount = circuit.failureCount + 1;
    if (failureCount >= threshold) {
      await this.save(provider, {
        state: CircuitState.OPEN,
        failureCount,
        openedAt: new Date().toISOString(),
      });
      this.logger.warn(
        `Circuit ${provider}: ${CircuitState.CLOSED} → ${CircuitState.OPEN} (failures=${failureCount})`,
      );
      return;
    }

    await this.save(provider, {
      state: CircuitState.CLOSED,
      failureCount,
      openedAt: null,
    });
  }
}
