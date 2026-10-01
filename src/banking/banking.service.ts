import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { RedisService } from '@/redis/redis.service';
import { nanoid } from 'nanoid';
import { BANKING_ERRORS } from '@/common/errors/index';
import { PaymentProviderFactory } from '@/payment-providers/payment-provider.factory';
import type {
  ListBanksResult,
  ValidateAccountResult,
} from '@/payment-providers/payment-provider.types';

@Injectable()
export class BankingService {
  private readonly logger = new Logger(BankingService.name);
  private readonly CACHE_TTL = {
    BANKS: 7 * 24 * 60 * 60,
    ACCOUNT_VERIFICATION: 5 * 60,
  };

  constructor(
    private readonly redisService: RedisService,
    private readonly paymentProviderFactory: PaymentProviderFactory,
  ) {}

  async banks(correlationId?: string) {
    const requestId = correlationId ?? nanoid();
    const startedAt = Date.now();
    const timestamp = new Date().toISOString();

    this.logger.log('List banks started', {
      requestId,
      operation: 'listBanks',
      timestamp,
    });

    try {
      const { adapter, provider, attempt, skippedProviders, isFailover } =
        await this.paymentProviderFactory.resolveDefaultWithMeta();

      const cacheKey = `banks-list:${provider}`;
      let banks = await this.redisService.getJson<ListBanksResult>(cacheKey);
      const cacheHit = Boolean(banks);

      if (!banks) {
        banks = await adapter.listBanks();
        await this.redisService.setJson(cacheKey, banks, this.CACHE_TTL.BANKS);
      }

      this.logger.log('List banks completed', {
        requestId,
        operation: 'listBanks',
        processor: provider,
        attempt,
        isFailover,
        skippedProviders,
        cacheHit,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
        bankCount: banks.data?.length,
      });

      return banks;
    } catch (error) {
      this.logger.error('List banks failed', {
        requestId,
        operation: 'listBanks',
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw new UnprocessableEntityException(
        BANKING_ERRORS.FAILED_TO_LIST_BANKS,
      );
    }
  }

  async verifyAccountNumber(
    input: {
      accountNumber: string;
      bankCode: string;
    },
    correlationId?: string,
  ) {
    const requestId = correlationId ?? nanoid();
    const startedAt = Date.now();
    const timestamp = new Date().toISOString();

    this.logger.log('Verify account started', {
      requestId,
      operation: 'validateAccount',
      accountNumber: input.accountNumber,
      bankCode: input.bankCode,
      timestamp,
    });

    try {
      const { adapter, provider, attempt, skippedProviders, isFailover } =
        await this.paymentProviderFactory.resolveDefaultWithMeta();

      const cacheKey = `account-verify:${provider}:${input.accountNumber}:${input.bankCode}`;
      let result =
        await this.redisService.getJson<ValidateAccountResult>(cacheKey);
      const cacheHit = Boolean(result);

      if (!result) {
        result = await adapter.validateAccount(input);
        await this.redisService.setJson(
          cacheKey,
          result,
          this.CACHE_TTL.ACCOUNT_VERIFICATION,
        );
      }

      this.logger.log('Verify account completed', {
        requestId,
        operation: 'validateAccount',
        processor: provider,
        attempt,
        isFailover,
        skippedProviders,
        cacheHit,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      this.logger.error('Verify account failed', {
        requestId,
        operation: 'validateAccount',
        accountNumber: input.accountNumber,
        bankCode: input.bankCode,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw new UnprocessableEntityException(
        BANKING_ERRORS.FAILED_TO_VERIFY_ACCOUNT,
      );
    }
  }
}
