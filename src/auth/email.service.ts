import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { EmailQueueService } from '../email/email-queue.service';
import { RedisService } from '../redis/redis.service';
import { generateOtpCode } from '../utils/helpers';
import { UserRepository } from './user.repository';

const OTP_TTL_SECONDS = 600;
const RESEND_LIMIT = 3;
const RESEND_WINDOW_SECONDS = 15 * 60;

type StoredEmailOtp = {
  otp: string;
  userId: string;
  createdAt: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly emailQueueService: EmailQueueService,
    private readonly userRepository: UserRepository,
  ) {}

  private otpKey(email: string) {
    return `email:otp:${email.toLowerCase()}`;
  }

  private resendKey(email: string) {
    return `email:otp:resend:${email.toLowerCase()}`;
  }

  private otpMatches(storedOtp: string, providedOtp: string) {
    const storedBuffer = Buffer.from(storedOtp);
    const providedBuffer = Buffer.from(providedOtp);

    if (storedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(storedBuffer, providedBuffer);
  }

  queueRegistrationOtp(user: { id: string; email: string; firstName: string }) {
    void this.createRegistrationOtp(user)
      .then((payload) => this.emailQueueService.queueRegistrationOtp(payload))
      .catch((error) => {
        this.logger.error(
          `Failed to queue registration email for ${user.email}`,
          error instanceof Error ? error.stack : error,
        );
      });
  }

  async createRegistrationOtp(user: {
    id: string;
    email: string;
    firstName: string;
  }) {
    const otp = generateOtpCode(6);
    const normalizedEmail = user.email.toLowerCase();

    await this.redisService.setJson(
      this.otpKey(normalizedEmail),
      {
        otp,
        userId: user.id,
        createdAt: new Date().toISOString(),
      } satisfies StoredEmailOtp,
      OTP_TTL_SECONDS,
    );

    return {
      to: user.email,
      firstName: user.firstName,
      otp,
    };
  }

  async sendRegistrationOtp(user: {
    id: string;
    email: string;
    firstName: string;
  }) {
    const payload = await this.createRegistrationOtp(user);
    await this.emailQueueService.enqueueRegistrationOtp(payload);
  }

  async verifyEmail(email: string, otp: string) {
    const normalizedEmail = email.toLowerCase();
    const user = await this.userRepository.findByEmail(normalizedEmail);

    if (!user) {
      throw new UnprocessableEntityException('Invalid or expired OTP');
    }

    if (user.emailVerifiedAt) {
      throw new ConflictException('Email is already verified');
    }

    const stored = await this.redisService.getJson<StoredEmailOtp>(
      this.otpKey(normalizedEmail),
    );

    if (
      !stored ||
      stored.userId !== user.id ||
      !this.otpMatches(stored.otp, otp)
    ) {
      throw new UnprocessableEntityException('Invalid or expired OTP');
    }

    await this.redisService.del(this.otpKey(normalizedEmail));

    const updatedUser = await this.userRepository.markEmailVerified(user.id);

    return {
      message: 'Email verified successfully',
      user: updatedUser,
    };
  }

  async resendOtp(email: string) {
    const normalizedEmail = email.toLowerCase();
    const user = await this.userRepository.findByEmail(normalizedEmail);

    if (!user) {
      return {
        message: 'If the account exists, a verification email was sent',
      };
    }

    if (user.emailVerifiedAt) {
      throw new ConflictException('Email is already verified');
    }

    const rateLimit = await this.redisService.rateLimit(
      this.resendKey(normalizedEmail),
      RESEND_LIMIT,
      RESEND_WINDOW_SECONDS,
    );

    if (!rateLimit.allowed) {
      throw new HttpException(
        'Too many verification emails requested. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.sendRegistrationOtp({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
    });

    return { message: 'Verification email sent' };
  }
}
