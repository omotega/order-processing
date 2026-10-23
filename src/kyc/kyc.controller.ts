import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Request } from 'express';
import { KycService } from '@/kyc/kyc.service';
import kycValidation, {
  InitiateBvnDto,
  VerifyBvnOtpDto,
} from '@/kyc/dto/kyc.validation';
import { ZodValidationPipe } from '@/middleware/validation';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard, UserRole } from '@/auth/guards/roles.guard';
import { ActiveUserGuard } from '@/auth/guards/active-user.guard';
import { CurrentUser, Roles } from '@/auth/decorators/auth.decorators';

@Controller('kyc')
@UseGuards(JwtAuthGuard, RolesGuard, ActiveUserGuard)
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Get('profile')
  @Roles(UserRole.USER)
  getProfile(@CurrentUser() user: { id: string }) {
    return this.kycService.getProfile(user.id);
  }

  @Post('bvn/initiate')
  @HttpCode(200)
  @Roles(UserRole.USER)
  @UsePipes(new ZodValidationPipe(kycValidation.initiateBvn))
  initiateBvn(
    @Body() body: InitiateBvnDto['body'],
    @CurrentUser() user: { id: string },
    @Req() req: Request,
  ) {
    return this.kycService.initiateBvn(
      user.id,
      body,
      req.ip ?? 'unknown',
    );
  }

  @Post('bvn/verify-otp')
  @HttpCode(200)
  @Roles(UserRole.USER)
  @UsePipes(new ZodValidationPipe(kycValidation.verifyBvnOtp))
  verifyBvnOtp(
    @Body() body: VerifyBvnOtpDto['body'],
    @CurrentUser() user: { id: string },
  ) {
    return this.kycService.verifyBvnOtp(user.id, body);
  }
}
