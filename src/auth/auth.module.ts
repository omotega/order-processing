import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from '@/auth/auth.controller';
import { AuthService } from '@/auth/auth.service';
import { UserRepository } from '@database/repository/user.repository';
import { RedisModule } from '@/redis/redis.module';
import { appConfig } from 'src/config/config';
import { JwtStrategy } from '@/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { RateLimitGuard } from '@/auth/guards/rate-limit.guard';
import { ActiveUserGuard } from '@/auth/guards/active-user.guard';
import { EmailModule } from '@/email/email.module';
import { EmailService } from '@/auth/email.service';

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
