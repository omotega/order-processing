import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Request } from 'express';
import userValidation, {
  LoginDto,
  PasswordResetConfirmDto,
  PasswordResetStartDto,
  RefreshDto,
  RegisterDto,
  SetTransactionPinDto,
  VerifyEmailDto,
} from '@/auth/dto/auth.validation';
import { AuthService } from '@/auth/auth.service';
import { ZodValidationPipe } from '@/middleware/validation';
import { CurrentUser, Public } from '@/auth/decorators/auth.decorators';
import { TransactionPinService } from '@/auth/transaction-pin.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '@/auth/guards/active-user.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly transactionPinService: TransactionPinService,
  ) {}

  @Post('register')
  @Public()
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(userValidation.register))
  async register(@Body() body: RegisterDto['body']) {
    return this.authService.register(body);
  }

  @Post('verify-email')
  @Public()
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(userValidation.verifyEmail))
  async verifyEmail(@Body() body: VerifyEmailDto['body'], @Req() req: Request) {
    return this.authService.verifyEmail(body, req.headers['user-agent']);
  }

  @Post('resend-verification-email')
  @Public()
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(userValidation.recoverAccount))
  async resendVerificationEmail(@Body() body: { email: string }) {
    return this.authService.resendVerificationEmail(body.email);
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(userValidation.login))
  async login(@Body() body: LoginDto['body'], @Req() req: Request) {
    const ip = req.ip ?? 'unknown';
    return this.authService.login(body, ip, req.headers['user-agent']);
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(userValidation.refresh))
  async refresh(@Body() body: RefreshDto['body'], @Req() req: Request) {
    return this.authService.refresh(
      body.refreshToken,
      req.headers['user-agent'],
    );
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: { sessionId?: string }) {
    if (!user.sessionId) {
      return { message: 'Logged out' };
    }
    return this.authService.logout(user.sessionId);
  }

  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@CurrentUser() user: { id: string }) {
    return this.authService.logoutAll(user.id);
  }

  @Post('password-reset/start')
  @Public()
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(userValidation.passwordResetStart))
  async passwordResetStart(@Body() body: PasswordResetStartDto['body']) {
    return this.authService.startPasswordReset(body.email);
  }

  @Post('password-reset/confirm')
  @Public()
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(userValidation.passwordResetConfirm))
  async passwordResetConfirm(@Body() body: PasswordResetConfirmDto['body']) {
    return this.authService.confirmPasswordReset(body);
  }

  @Post('transaction-pin')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(userValidation.setTransactionPin))
  async setTransactionPin(
    @Body() body: SetTransactionPinDto['body'],
    @CurrentUser() user: { id: string },
  ) {
    return this.transactionPinService.setPin(user.id, body.password, body.pin);
  }
}
