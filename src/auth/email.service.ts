import {
  HttpException,
  HttpStatus,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EmailQueueService } from '@/email/email-queue.service';
import { RedisService } from '@/redis/redis.service';
import { generateOtpCode, hmacHex } from '@/utils/helpers';
import { appConfig } from '@/config/config';
import { COMMON_ERRORS, EMAIL_ERRORS } from '@/common/errors/index';

const OTP_TTL_SECONDS = 600;
const RESEND_LIMIT = 3;
const RESEND_WINDOW_SECONDS = 15 * 60;
const MAX_OTP_ATTEMPTS = 5;

type StoredEmailOtp = {
  otpHash: string;
  userId: string;
  attempts: number;
  generation: string;
};

const CLAIM_OTP_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'MISSING' end
local data = cjson.decode(raw)
if data.otpHash ~= ARGV[1] then
  data.attempts = (data.attempts or 0) + 1
  if data.attempts >= tonumber(ARGV[2]) then
    redis.call('DEL', KEYS[1])
    return 'EXHAUSTED'
  end
  redis.call('SET', KEYS[1], cjson.encode(data), 'KEEPTTL')
  return 'MISMATCH'
end
redis.call('DEL', KEYS[1])
return 'OK'
`;

@Injectable()
export class EmailService {
  constructor(
    private readonly redisService: RedisService,
    private readonly emailQueueService: EmailQueueService,
  ) {}

  private otpKey(email: string) {
    return `email:otp:${email.toLowerCase()}`;
  }

  private passwordResetKey(email: string) {
    return `email:password-reset:${email.toLowerCase()}`;
  }

  private resendKey(email: string) {
    return `email:otp:resend:${email.toLowerCase()}`;
  }

  async sendRegistrationOtp(user: { id: string; email: string }) {
    const normalizedEmail = user.email.toLowerCase();
    await this.assertResendAllowed(normalizedEmail);
    const otp = generateOtpCode(6);
    const generation = `${Date.now()}`;
    const stored: StoredEmailOtp = {
      otpHash: hmacHex(otp, appConfig.otpHmacKey),
      userId: user.id,
      attempts: 0,
      generation,
    };
    await this.redisService.setJson(
      this.otpKey(normalizedEmail),
      stored,
      OTP_TTL_SECONDS,
    );
    await this.emailQueueService.enqueueRegistrationOtp({
      to: normalizedEmail,
      firstName: 'there',
      otp,
    });
  }

  async sendAlreadyRegistered(email: string) {
    const normalizedEmail = email.toLowerCase();
    await this.assertResendAllowed(normalizedEmail);
    await this.emailQueueService.enqueueAccountNotice(
      normalizedEmail,
      'Account already registered',
      'This email is already registered. Sign in or reset your password.',
    );
  }

  async claimRegistrationOtp(
    email: string,
    otp: string,
    userId: string,
  ): Promise<StoredEmailOtp | null> {
    const normalizedEmail = email.toLowerCase();
    const key = this.otpKey(normalizedEmail);
    const stored = await this.redisService.getJson<StoredEmailOtp>(key);
    if (!stored || stored.userId !== userId) {
      throw new UnprocessableEntityException(
        COMMON_ERRORS.INVALID_OR_EXPIRED_OTP,
      );
    }
    const result = await this.redisService.evalScript(
      CLAIM_OTP_SCRIPT,
      [key],
      [hmacHex(otp, appConfig.otpHmacKey), String(MAX_OTP_ATTEMPTS)],
    );
    if (result !== 'OK') {
      throw new UnprocessableEntityException(
        COMMON_ERRORS.INVALID_OR_EXPIRED_OTP,
      );
    }
    return stored;
  }

  async restoreRegistrationOtp(email: string, stored: StoredEmailOtp) {
    await this.redisService.setJson(
      this.otpKey(email.toLowerCase()),
      stored,
      120,
    );
  }

  async sendPasswordResetOtp(user: { id: string; email: string }) {
    const normalizedEmail = user.email.toLowerCase();
    await this.assertResendAllowed(normalizedEmail);
    const otp = generateOtpCode(6);
    const stored: StoredEmailOtp = {
      otpHash: hmacHex(otp, appConfig.otpHmacKey),
      userId: user.id,
      attempts: 0,
      generation: `${Date.now()}`,
    };
    await this.redisService.setJson(
      this.passwordResetKey(normalizedEmail),
      stored,
      OTP_TTL_SECONDS,
    );
    await this.emailQueueService.enqueueAccountNotice(
      normalizedEmail,
      'Password reset code',
      `Your password reset code is ${otp}. It expires in 10 minutes.`,
    );
  }

  async claimPasswordResetOtp(email: string, otp: string, userId: string) {
    const normalizedEmail = email.toLowerCase();
    const key = this.passwordResetKey(normalizedEmail);
    const stored = await this.redisService.getJson<StoredEmailOtp>(key);
    if (!stored || stored.userId !== userId) {
      throw new UnprocessableEntityException(
        COMMON_ERRORS.INVALID_OR_EXPIRED_OTP,
      );
    }
    const result = await this.redisService.evalScript(
      CLAIM_OTP_SCRIPT,
      [key],
      [hmacHex(otp, appConfig.otpHmacKey), String(MAX_OTP_ATTEMPTS)],
    );
    if (result !== 'OK') {
      throw new UnprocessableEntityException(
        COMMON_ERRORS.INVALID_OR_EXPIRED_OTP,
      );
    }
  }

  async resendRegistrationOtp(user: { id: string; email: string }) {
    await this.sendRegistrationOtp(user);
  }

  private async assertResendAllowed(email: string) {
    const rateLimit = await this.redisService.rateLimit(
      this.resendKey(email),
      RESEND_LIMIT,
      RESEND_WINDOW_SECONDS,
    );
    if (!rateLimit.allowed) {
      throw new HttpException(
        EMAIL_ERRORS.RESEND_RATE_LIMIT,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
