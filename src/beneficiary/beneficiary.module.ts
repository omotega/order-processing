import { Module } from '@nestjs/common';
import { BeneficiaryController } from '@/beneficiary/beneficiary.controller';
import { BeneficiaryService } from '@/beneficiary/beneficiary.service';
import { BeneficiaryRepository } from '@database/repository/beneficiary.repository';

@Module({
  controllers: [BeneficiaryController],
  providers: [BeneficiaryService, BeneficiaryRepository],
  exports: [BeneficiaryService, BeneficiaryRepository],
})
export class BeneficiaryModule {}
