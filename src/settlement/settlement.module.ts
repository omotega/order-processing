import { Module } from '@nestjs/common';
import { SettlementController } from '@/settlement/settlement.controller';
import { SettlementService } from '@/settlement/settlement.service';
import { SettlementRepository } from '@database/repository/settlement.repository';

@Module({
  controllers: [SettlementController],
  providers: [SettlementService, SettlementRepository],
  exports: [SettlementService, SettlementRepository],
})
export class SettlementModule {}
