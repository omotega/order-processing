import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  LoginDto,
  RegisterDto,
  VerifyEmailDto,
  PasswordResetConfirmDto,
} from '@/auth/dto/auth.validation';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { UserRepository } from '@database/repository/user.repository';
import { UserStatus } from '@/utils/database.enums';
import { EmailService } from '@/auth/email.service';
import { newId } from '@/utils/id';
import { AUTH_ERRORS } from '@/common/errors/index';
import { AccountService } from '@/ledger/account.service';
import { DatabaseService } from '@/database/database.service';
import { AuthSessionService } from '@/auth/auth-session.service';
import { RedisService } from '@/redis/redis.service';

const GENERIC_AUTH_MESSAGE =
  'If this email is eligible, a verification message was sent.';

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly emailService: EmailService,
    private readonly accountService: AccountService,
    private readonly db: DatabaseService,
    private readonly authSessionService: AuthSessionService,
    private readonly redisService: RedisService,
  ) {}

  async register(payload: RegisterDto['body']) {
    const email = payload.email;
    const existing = await this.userRepository.findByEmail(email);
    if (existing?.emailVerifiedAt) {
      await this.emailService.sendAlreadyRegistered(email);
      return { message: GENERIC_AUTH_MESSAGE };
    }
    if (existing) {
      await this.emailService.resendRegistrationOtp({
        id: existing.id,
        email: existing.email,
      });
      return { message: GENERIC_AUTH_MESSAGE };
    }
    const unusablePassword = await argon2.hash(randomBytes(32).toString('hex'));
    const created = await this.userRepository.createPending({
      id: newId(),
      email,
      password: unusablePassword,
    });
    await this.emailService.sendRegistrationOtp({
      id: created.id,
      email: created.email,
    });
    return { message: GENERIC_AUTH_MESSAGE };
  }

  async verifyEmail(payload: VerifyEmailDto['body'], userAgent?: string) {
    const user = await this.userRepository.findByEmail(payload.email);
    if (!user) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }
    if (user.emailVerifiedAt && user.status === UserStatus.ACTIVE) {
      return this.issueAuthResponse(user, userAgent);
    }
    const stored = await this.emailService.claimRegistrationOtp(
      payload.email,
      payload.otp,
      user.id,
    );
    const passwordHash = await argon2.hash(payload.password);
    try {
      await this.db.transaction().execute(async (trx) => {
        const activated = await this.userRepository.activateWithPassword(
          user.id,
          passwordHash,
          trx,
        );
        if (!activated) {
          throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
        }
        await this.accountService.createUserAccount(user.id, trx);
      });
    } catch (error) {
      if (stored) {
        await this.emailService.restoreRegistrationOtp(payload.email, stored);
      }
      throw error;
    }
    const active = await this.userRepository.findById(user.id);
    return this.issueAuthResponse(active!, userAgent);
  }

  async resendVerificationEmail(email: string) {
    const user = await this.userRepository.findByEmail(email);
    if (user && !user.emailVerifiedAt) {
      await this.emailService.resendRegistrationOtp({
        id: user.id,
        email: user.email,
      });
    }
    return { message: GENERIC_AUTH_MESSAGE };
  }

  async login(payload: LoginDto['body'], ip: string, userAgent?: string) {
    await this.assertLoginIpAllowed(ip);
    const user = await this.userRepository.findByEmail(payload.email);
    if (!user) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException(AUTH_ERRORS.ACCOUNT_LOCKED);
    }
    if (user.status !== UserStatus.ACTIVE || !user.emailVerifiedAt) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }
    const passwordMatch = await argon2.verify(user.password, payload.password);
    if (!passwordMatch) {
      await this.recordFailedLogin(user.id);
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }
    await this.userRepository.clearLoginFailures(user.id);
    return this.issueAuthResponse(user, userAgent);
  }

  async refresh(refreshToken: string) {
    const rotated = await this.authSessionService.refresh(refreshToken);
    const session = await this.authSessionService.assertSessionActive(
      rotated.sessionId,
    );
    const user = await this.userRepository.findById(session.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(AUTH_ERRORS.SESSION_INVALID);
    }
    const accessToken = this.authSessionService.signAccessToken({
      sub: user.id,
      email: user.email,
      sid: session.id,
    });
    return {
      accessToken,
      refreshToken: rotated.refreshToken,
      user: this.publicUser(user),
    };
  }

  async logout(sessionId: string) {
    await this.authSessionService.revoke(sessionId);
    return { message: 'Logged out' };
  }

  async logoutAll(userId: string) {
    await this.authSessionService.revokeAllForUser(userId);
    return { message: 'Logged out from all devices' };
  }

  async startPasswordReset(email: string) {
    const user = await this.userRepository.findByEmail(email);
    if (user?.emailVerifiedAt) {
      await this.emailService.sendPasswordResetOtp({
        id: user.id,
        email: user.email,
      });
    }
    return { message: GENERIC_AUTH_MESSAGE };
  }

  async confirmPasswordReset(payload: PasswordResetConfirmDto['body']) {
    const user = await this.userRepository.findByEmail(payload.email);
    if (!user?.emailVerifiedAt) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }
    await this.emailService.claimPasswordResetOtp(
      payload.email,
      payload.otp,
      user.id,
    );
    const passwordHash = await argon2.hash(payload.password);
    await this.db.transaction().execute(async (trx) => {
      await this.userRepository.setPassword(user.id, passwordHash, trx);
      await this.authSessionService.revokeAllForUser(user.id);
    });
    return { message: 'Password updated' };
  }

  async validateUser(userId: string, sessionId?: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(AUTH_ERRORS.ACCOUNT_NOT_ACTIVE);
    }
    if (sessionId) {
      await this.authSessionService.assertSessionActive(sessionId);
    }
    return { ...user, sessionId };
  }

  private async issueAuthResponse(
    user: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      status: UserStatus;
      createdAt: Date;
      role: string;
      kycTier: number;
    },
    userAgent?: string,
  ) {
    const session = await this.authSessionService.createSession(
      { id: user.id, email: user.email },
      userAgent,
    );
    return {
      user: this.publicUser(user),
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  }

  private publicUser(user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    status: UserStatus;
    createdAt: Date;
    role: string;
    kycTier: number;
  }) {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      status: user.status,
      createdAt: user.createdAt,
      role: user.role,
      kycTier: user.kycTier,
    };
  }

  private async assertLoginIpAllowed(ip: string) {
    const key = `rate_limit:login:ip:${ip}`;
    const result = await this.redisService.rateLimit(key, 30, 900);
    if (!result.allowed) {
      throw new HttpException(
        'Too many login attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordFailedLogin(userId: string) {
    await this.userRepository.recordFailedLogin(userId);
  }
}
