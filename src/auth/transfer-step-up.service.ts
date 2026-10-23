import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from '@/redis/redis.service';
import { AUTH_ERRORS } from '@/common/errors/index';
import { hashTransferPayload } from '@/transfer/acceptance/transfer-payload-hash';

const AUTH_TTL_SECONDS = 120;

type StoredTransferAuth = {
  userId: string;
  payloadHash: string;
};

@Injectable()
export class TransferStepUpService {
  constructor(private readonly redisService: RedisService) {}

  private key(token: string) {
    return `transfer:auth:${token}`;
  }

  async issue(userId: string, payload: {
    amount: number;
    bankCode: string;
    accountNumber: string;
    currency: string;
  }) {
    const payloadHash = hashTransferPayload({
      userId,
      amount: payload.amount,
      currency: payload.currency,
      bankCode: payload.bankCode,
      accountNumber: payload.accountNumber,
    });
    const token = randomBytes(32).toString('hex');
    try {
      await this.redisService.setJson(
        this.key(token),
        { userId, payloadHash } satisfies StoredTransferAuth,
        AUTH_TTL_SECONDS,
      );
    } catch {
      throw new ServiceUnavailableException(
        'Transfer authorization is temporarily unavailable',
      );
    }
    return { authorization: token, expiresInSeconds: AUTH_TTL_SECONDS };
  }

  async consume(
    token: string,
    userId: string,
    payload: {
      amount: number;
      bankCode: string;
      accountNumber: string;
      currency: string;
    },
  ) {
    const payloadHash = hashTransferPayload({
      userId,
      amount: payload.amount,
      currency: payload.currency,
      bankCode: payload.bankCode,
      accountNumber: payload.accountNumber,
    });
    let raw: string | null;
    try {
      raw = await this.redisService.getDel(this.key(token));
    } catch {
      throw new ServiceUnavailableException(
        'Transfer authorization is temporarily unavailable',
      );
    }
    if (!raw) {
      throw new UnauthorizedException(AUTH_ERRORS.TRANSFER_NOT_AUTHORIZED);
    }
    const stored = JSON.parse(raw) as StoredTransferAuth;
    if (stored.userId !== userId || stored.payloadHash !== payloadHash) {
      throw new UnauthorizedException(AUTH_ERRORS.TRANSFER_NOT_AUTHORIZED);
    }
  }
}
