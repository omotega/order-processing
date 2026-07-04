import { Body, Controller, HttpCode, Post, UsePipes } from '@nestjs/common';
import userValidation, {
  LoginDto,
  RegisterDto,
  ValidateAccounttDto,
} from './dto/auth.validation';
import { AuthService } from './auth.service';
import { ZodValidationPipe } from '../middleware/validation';
import { Public } from './decorators/auth.decorators';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(userValidation.register))
  async register(@Body() body: RegisterDto['body']) {
    return this.authService.register(body);
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(userValidation.login))
  async login(@Body() body: LoginDto['body']) {
    return this.authService.login(body);
  }

  @Post('verify-email')
  @Public()
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(userValidation.validateAccount))
  async verifyEmail(@Body() body: ValidateAccounttDto['body']) {
    return this.authService.verifyEmail(body.email, body.otp);
  }

  @Post('resend-verification-email')
  @Public()
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(userValidation.recoverAccount))
  async resendVerificationEmail(@Body() body: { email: string }) {
    return this.authService.resendVerificationEmail(body.email);
  }
}
