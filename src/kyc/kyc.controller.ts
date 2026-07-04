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
import { KycService } from './kyc.service';
import kycValidation, {
  InitiateBvnDto,
  SubmitKycDto,
  VerifyBvnOtpDto,
} from './dto/kyc.validation';
import { ZodValidationPipe } from '../middleware/validation';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AllowInactive,
  CurrentUser,
  Roles,
} from '../auth/decorators/auth.decorators';
import { UserRole } from '../auth/guards/roles.guard';

@Controller('kyc')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Get('profile')
  @Roles(UserRole.USER)
  @AllowInactive()
  getProfile(@CurrentUser() user: { id: string }) {
    return this.kycService.getProfile(user.id);
  }

  @Post('bvn/initiate')
  @HttpCode(200)
  @Roles(UserRole.USER)
  @AllowInactive()
  @UsePipes(new ZodValidationPipe(kycValidation.initiateBvn))
  initiateBvn(
    @Body() body: InitiateBvnDto['body'],
    @CurrentUser() user: { id: string },
  ) {
    return this.kycService.initiateBvn(user.id, body);
  }

  @Post('bvn/verify-otp')
  @HttpCode(200)
  @Roles(UserRole.USER)
  @AllowInactive()
  @UsePipes(new ZodValidationPipe(kycValidation.verifyBvnOtp))
  verifyBvnOtp(
    @Body() body: VerifyBvnOtpDto['body'],
    @CurrentUser() user: { id: string },
  ) {
    return this.kycService.verifyBvnOtp(user.id, body);
  }

  @Post('submit')
  @HttpCode(200)
  @Roles(UserRole.USER)
  @AllowInactive()
  @UsePipes(new ZodValidationPipe(kycValidation.submit))
  submit(
    @Body() body: SubmitKycDto['body'],
    @CurrentUser() user: { id: string },
  ) {
    return this.kycService.submit(user.id, body);
  }

  @Post('verify/:userId')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  verify(
    @Param('userId') userId: string,
    @CurrentUser() admin: { id: string },
  ) {
    return this.kycService.verify(userId, admin.id);
  }

  @Post('reject/:userId')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  reject(
    @Param('userId') userId: string,
    @Body() body: { reason: string },
    @CurrentUser() admin: { id: string },
  ) {
    return this.kycService.reject(userId, admin.id, body.reason);
  }
}
