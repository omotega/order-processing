import { Test, TestingModule } from '@nestjs/testing';
import { BankingService } from './banking.service';

describe('BankingService', () => {
  let service: BankingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BankingService],
    }).compile();

    service = module.get<BankingService>(BankingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
