jest.mock('@/redis/redis.service', () => ({ RedisService: class {} }));
jest.mock('@/payment-providers/payment-provider.factory', () => ({
  PaymentProviderFactory: class {},
}));
jest.mock('@/config/config', () => ({
  appConfig: { paymentProviderClaimLeaseSeconds: 30 },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BankingService } from '@/banking/banking.service';
import { PaymentProviderFactory } from '@/payment-providers/payment-provider.factory';
import { RedisService } from '@/redis/redis.service';

describe('BankingService', () => {
  let service: BankingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankingService,
        { provide: RedisService, useValue: {} },
        { provide: PaymentProviderFactory, useValue: {} },
      ],
    }).compile();

    service = module.get<BankingService>(BankingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
