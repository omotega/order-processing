import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserRepository } from './user.repository';
import { RedisModule } from '../redis/redis.module';
import { appConfig } from 'src/config/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { ActiveUserGuard } from './guards/active-user.guard';
import { EmailModule } from '../email/email.module';
import { EmailService } from './email.service';

@Module({
  imports: [
    RedisModule,
    EmailModule,
    PassportModule,
    JwtModule.register({
      secret: appConfig.jwtSecret,
      signOptions: {
        expiresIn: appConfig.jwtExpires,
        issuer: 'order-processing-api',
        audience: 'order-processing-client',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    UserRepository,
    EmailService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    RateLimitGuard,
    ActiveUserGuard,
  ],
  exports: [
    AuthService,
    UserRepository,
    JwtAuthGuard,
    RolesGuard,
    RateLimitGuard,
    ActiveUserGuard,
  ],
})
export class AuthModule {}
