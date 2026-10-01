import { Body, Controller, Get, Post, Req, UsePipes } from '@nestjs/common';
import type { Request } from 'express';
import { BankingService } from '@/banking/banking.service';
import bankingValidation, {
  VerifyAccountNumberDto,
} from '@/banking/dto/banking.validation';
import { ZodValidationPipe } from '@/middleware/validation';
import { Public } from '@/auth/decorators/auth.decorators';

@Controller('banking')
export class BankingController {
  constructor(private readonly bankingService: BankingService) {}

  @Get('banks')
  @Public()
  async getBanks(@Req() request: Request) {
    return this.bankingService.banks(request.correlationId);
  }

  @Post('verify-account-number')
  @UsePipes(new ZodValidationPipe(bankingValidation.verifyAccountNumber))
  async verifyAccountNumber(
    @Body() body: VerifyAccountNumberDto['body'],
    @Req() request: Request,
  ) {
    return this.bankingService.verifyAccountNumber(body, request.correlationId);
  }
}
