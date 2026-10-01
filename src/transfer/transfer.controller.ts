import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Request } from 'express';
import { TransferService } from '@/transfer/transfer.service';
import transferValidation, {
  TransferDto,
  ValidateTransferAmountDto,
} from '@/transfer/dto/transfer.validation';
import { IdempotencyKeyHeaderPipe } from '@/common/pipes/idempotency-key-header.pipe';
import { ZodValidationPipe } from '@/middleware/validation';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard, UserRole } from '@/auth/guards/roles.guard';
import { ActiveUserGuard } from '@/auth/guards/active-user.guard';
import { CurrentUser, Roles } from '@/auth/decorators/auth.decorators';

@Controller('banking')
export class TransferController {
  constructor(
    private readonly transferService: TransferService,
    private readonly idempotencyKeyHeaderPipe: IdempotencyKeyHeaderPipe,
  ) {}

  @Post('validate-transfer-amount')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard, ActiveUserGuard)
  @Roles(UserRole.USER)
  @UsePipes(new ZodValidationPipe(transferValidation.validateTransferAmount))
  async validateTransferAmount(
    @Body() body: ValidateTransferAmountDto['body'],
    @CurrentUser() user: any,
  ) {
    return this.transferService.validateTransferAmount(body, user);
  }

  @Post('transfer')
  @HttpCode(202)
  @UseGuards(JwtAuthGuard, RolesGuard, ActiveUserGuard)
  @Roles(UserRole.USER)
  @UsePipes(new ZodValidationPipe(transferValidation.transfer))
  async initiateTransfer(
    @Body() body: TransferDto['body'],
    @CurrentUser() user: any,
    @Req() request: Request,
  ) {
    const idempotencyKey = this.idempotencyKeyHeaderPipe.transform(
      request.headers['idempotency-key'],
    );

    return this.transferService.initiateAsyncTransfer(
      body,
      user,
      idempotencyKey,
      request.correlationId,
    );
  }

  @Get('transfer/:reference')
  @UseGuards(JwtAuthGuard, RolesGuard, ActiveUserGuard)
  @Roles(UserRole.USER)
  async getTransferStatus(@Param('reference') reference: string) {
    const status = await this.transferService.getTransferStatus(reference);
    if (!status) {
      throw new NotFoundException('Transfer not found');
    }
    return status;
  }
}
