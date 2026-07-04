import { Test, TestingModule } from '@nestjs/testing';
import { BankingController } from './banking.controller';

describe('BankingController', () => {
  let controller: BankingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BankingController],
    }).compile();

    controller = module.get<BankingController>(BankingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
