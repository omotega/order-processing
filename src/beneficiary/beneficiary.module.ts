import { Module } from '@nestjs/common';
import { BeneficiaryController } from './beneficiary.controller';
import { BeneficiaryService } from './beneficiary.service';
import { BeneficiaryRepository } from './beneficiary.repository';

@Module({
  controllers: [BeneficiaryController],
  providers: [BeneficiaryService, BeneficiaryRepository],
  exports: [BeneficiaryService, BeneficiaryRepository],
})
export class BeneficiaryModule {}
