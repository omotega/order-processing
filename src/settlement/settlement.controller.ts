import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { SettlementService } from '@/settlement/settlement.service';
import settlementValidation, {
  CreateSettlementBatchDto,
  ReconcileBatchDto,
} from '@/settlement/dto/settlement.validation';
import { ZodValidationPipe } from '@/middleware/validation';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { CurrentUser, Roles } from '@/auth/decorators/auth.decorators';
import { UserRole } from '@/auth/guards/roles.guard';

@Controller('settlement')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Get('batches')
  listBatches() {
    return this.settlementService.listBatches();
  }

  @Post('batches')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(settlementValidation.createBatch))
  createBatch(
    @Body() body: CreateSettlementBatchDto['body'],
    @CurrentUser() admin: { id: string },
  ) {
    return this.settlementService.createBatch(admin.id, body);
  }

  @Post('batches/:batchId/reconcile')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(settlementValidation.reconcile))
  reconcile(
    @Param('batchId') batchId: string,
    @Body() body: ReconcileBatchDto['body'],
    @CurrentUser() admin: { id: string },
  ) {
    return this.settlementService.reconcileBatch(admin.id, batchId, body);
  }

  @Get('batches/:batchId/items')
  getItems(@Param('batchId') batchId: string) {
    return this.settlementService.getReconciliationItems(batchId);
  }
}
