import {
  Body,
  Controller,
  Get,
  Headers,
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
  AuthorizeTransferDto,
  TransferDto,
  ValidateTransferAmountDto,
} from '@/transfer/dto/transfer.validation';
import { IdempotencyKeyHeaderPipe } from '@/common/pipes/idempotency-key-header.pipe';
import { ZodValidationPipe } from '@/middleware/validation';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard, UserRole } from '@/auth/guards/roles.guard';
import { ActiveUserGuard } from '@/auth/guards/active-user.guard';
import { CurrentUser, Roles } from '@/auth/decorators/auth.decorators';
import { TransactionPinService } from '@/auth/transaction-pin.service';
import { TransferDestinationService } from '@/transfer/transfer-destination.service';

@Controller('banking')
export class TransferController {
  constructor(
    private readonly transferService: TransferService,
    private readonly idempotencyKeyHeaderPipe: IdempotencyKeyHeaderPipe,
    private readonly transactionPinService: TransactionPinService,
    private readonly transferDestinationService: TransferDestinationService,
  ) {}

  @Post('validate-transfer-amount')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard, ActiveUserGuard)
  @Roles(UserRole.USER)
  @UsePipes(new ZodValidationPipe(transferValidation.validateTransferAmount))
  async validateTransferAmount(
    @Body() body: ValidateTransferAmountDto['body'],
    @CurrentUser() user: { id: string },
  ) {
    return this.transferService.validateTransferAmount(body, user);
  }

  @Post('transfer/authorize')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard, ActiveUserGuard)
  @Roles(UserRole.USER)
  @UsePipes(new ZodValidationPipe(transferValidation.authorizeTransfer))
  async authorizeTransfer(
    @Body() body: AuthorizeTransferDto['body'],
    @CurrentUser() user: { id: string },
  ) {
    const { pin, ...transfer } = body;
    const destination = await this.transferDestinationService.resolve(
      user.id,
      transfer,
    );
    return this.transactionPinService.authorizeTransfer(user.id, pin, {
      amount: transfer.amount,
      bankCode: destination.bankCode,
      accountNumber: destination.accountNumber,
      currency: 'NGN',
    });
  }

  @Post('transfer')
  @HttpCode(202)
  @UseGuards(JwtAuthGuard, RolesGuard, ActiveUserGuard)
  @Roles(UserRole.USER)
  @UsePipes(new ZodValidationPipe(transferValidation.transfer))
  async initiateTransfer(
    @Body() body: TransferDto['body'],
    @CurrentUser() user: { id: string },
    @Req() request: Request,
    @Headers('x-transfer-authorization') transferAuthorization?: string,
  ) {
    const idempotencyKey = this.idempotencyKeyHeaderPipe.transform(
      request.headers['idempotency-key'],
    );

    return this.transferService.initiateAsyncTransfer(
      body,
      user,
      idempotencyKey,
      request.correlationId,
      transferAuthorization,
    );
  }

  @Get('transfer/:reference')
  @UseGuards(JwtAuthGuard, RolesGuard, ActiveUserGuard)
  @Roles(UserRole.USER)
  async getTransferStatus(
    @Param('reference') reference: string,
    @CurrentUser() user: { id: string },
  ) {
    const status = await this.transferService.getTransferStatus(
      reference,
      user.id,
    );
    if (!status) {
      throw new NotFoundException('Transfer not found');
    }
    return status;
  }
}
