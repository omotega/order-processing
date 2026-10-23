import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHmac } from 'crypto';
import { appConfig } from '@/config/config';
import { UserRepository } from '@database/repository/user.repository';
import { AUTH_ERRORS } from '@/common/errors/index';
import { TransferStepUpService } from '@/auth/transfer-step-up.service';

const PIN_LOCK_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;

@Injectable()
export class TransactionPinService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly transferStepUpService: TransferStepUpService,
  ) {}

  private pepperPin(pin: string): string {
    return createHmac('sha256', appConfig.transactionPinPepper)
      .update(pin)
      .digest('hex');
  }

  async setPin(userId: string, password: string, pin: string) {
    const user = await this.userRepository.findByIdWithPassword(userId);
    if (!user) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }
    const passwordOk = await argon2.verify(user.password, password);
    if (!passwordOk) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }
    const pinHash = await argon2.hash(this.pepperPin(pin));
    await this.userRepository.setTransactionPin(userId, pinHash);
    return { message: 'Transaction PIN set' };
  }

  async authorizeTransfer(
    userId: string,
    pin: string,
    payload: {
      amount: number;
      bankCode: string;
      accountNumber: string;
      currency: string;
    },
  ) {
    const user = await this.userRepository.findById(userId);
    if (!user?.transactionPinHash) {
      throw new UnprocessableEntityException(AUTH_ERRORS.PIN_NOT_SET);
    }
    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      throw new ForbiddenException(AUTH_ERRORS.PIN_LOCKED);
    }
    const pinOk = await argon2.verify(
      user.transactionPinHash,
      this.pepperPin(pin),
    );
    if (!pinOk) {
      const updated = await this.userRepository.recordFailedPin(userId);
      if ((updated?.pinFailedAttempts ?? 0) >= PIN_LOCK_ATTEMPTS) {
        throw new ForbiddenException(AUTH_ERRORS.PIN_LOCKED);
      }
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_PIN);
    }
    await this.userRepository.clearPinFailures(userId);
    return this.transferStepUpService.issue(userId, payload);
  }
}
