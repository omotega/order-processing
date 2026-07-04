import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UsePipes,
  UseGuards,
} from '@nestjs/common';
import { BankingService } from './banking.service';
import bankingValidation, { TransferDto } from './dto/banking.validation';
import { ZodValidationPipe } from 'src/middleware/validation';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { CurrentUser, Public } from '../auth/decorators/auth.decorators';
import { UserRole } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/auth.decorators';

@Controller('banking')
export class BankingController {
  constructor(private readonly bankingService: BankingService) {}

  @Get('banks')
  @Public()
  async getBanks() {
    return this.bankingService.banks();
  }

  @Post('verify-account-number')
  async verifyAccountNumber() {
    return this.bankingService.verifyAccountNumber();
  }

  @Post('transfer')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard, ActiveUserGuard)
  @Roles(UserRole.USER)
  @UsePipes(new ZodValidationPipe(bankingValidation.transfer))
  async transfer(@Body() body: TransferDto['body'], @CurrentUser() user: any) {
    return this.bankingService.transfer(body, user);
  }
}
