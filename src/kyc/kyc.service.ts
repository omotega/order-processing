import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { newId } from '@/utils/id';
import { KycRepository } from '@database/repository/kyc.repository';
import { AuditService } from '@/audit/audit.service';
import { InitiateBvnDto, VerifyBvnOtpDto } from '@/kyc/dto/kyc.validation';
import { ActorType, KycStatus, UserStatus } from '@/utils/database.enums';
import type { NewKycProfile } from '@/database/database.types';
import { UserRepository } from '@database/repository/user.repository';
import { DatabaseService } from '@/database/database.service';
import { RedisService } from '@/redis/redis.service';
import { COMMON_ERRORS, KYC_ERRORS } from '@/common/errors/index';
import { fingerprintIdentifier, sealData } from '@/utils/helpers';
import { appConfig } from '@/config/config';
import {
  BVN_VERIFIER,
  type BvnVerifier,
} from '@/services/mono/bvn-verifier';
import { MonoApiError } from '@/services/mono/mono.errors';

const BVN_INITIATE_LIMIT = 3;
const BVN_INITIATE_WINDOW = 15 * 60;
const BVN_INIT_TTL_SECONDS = 15 * 60;

type BvnInitRecord = {
  sessionId: string;
  fingerprint: string;
  expiresAt: string;
};

@Injectable()
export class KycService {
  constructor(
    private readonly kycRepository: KycRepository,
    private readonly auditService: AuditService,
    private readonly userRepository: UserRepository,
    private readonly db: DatabaseService,
    private readonly redisService: RedisService,
    @Inject(BVN_VERIFIER) private readonly bvnVerifier: BvnVerifier,
  ) {}

  async getProfile(userId: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(COMMON_ERRORS.USER_NOT_FOUND);
    }
    return this.kycRepository.findPublicProfileByUserId(userId, user.kycTier);
  }

  async initiateBvn(
    userId: string,
    payload: InitiateBvnDto['body'],
    clientIp: string,
  ) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(COMMON_ERRORS.USER_NOT_FOUND);
    }
    if (user.status !== UserStatus.ACTIVE || !user.emailVerifiedAt) {
      throw new ForbiddenException(KYC_ERRORS.EMAIL_VERIFICATION_REQUIRED);
    }
    if (user.kycTier >= 1) {
      throw new ConflictException(KYC_ERRORS.ALREADY_VERIFIED);
    }

    const fingerprint = fingerprintIdentifier(payload.bvn);
    await this.enforceBvnRateLimits(userId, fingerprint, clientIp);

    let response;
    try {
      response = await this.bvnVerifier.initiateBvnLookup({
        bvn: payload.bvn,
        scope: 'identity',
      });
    } catch (error) {
      if (error instanceof MonoApiError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }

    const sessionId = response.data?.session_id;
    if (!sessionId) {
      throw new UnprocessableEntityException(
        response.message ?? 'BVN initiation failed',
      );
    }

    const record: BvnInitRecord = {
      sessionId,
      fingerprint,
      expiresAt: new Date(Date.now() + BVN_INIT_TTL_SECONDS * 1000).toISOString(),
    };
    await this.redisService.setJson(
      this.initKey(userId),
      record,
      BVN_INIT_TTL_SECONDS,
    );

    return {
      status: response.status,
      message: response.message,
      methods: response.data?.methods,
    };
  }

  async verifyBvnOtp(userId: string, payload: VerifyBvnOtpDto['body']) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(COMMON_ERRORS.USER_NOT_FOUND);
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(KYC_ERRORS.EMAIL_VERIFICATION_REQUIRED);
    }

    const init = await this.redisService.getJson<BvnInitRecord>(
      this.initKey(userId),
    );
    if (!init || new Date(init.expiresAt).getTime() <= Date.now()) {
      throw new UnprocessableEntityException(COMMON_ERRORS.INVALID_OR_EXPIRED_OTP);
    }

    let response;
    try {
      response = await this.bvnVerifier.verifyBvnOtp(init.sessionId, {
        otp: payload.otp,
      });
    } catch (error) {
      await this.recordAttempt(userId, init.sessionId, 'FAILED', 'PROVIDER_ERROR');
      if (error instanceof MonoApiError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }

    if (!this.isSuccessfulStatus(response.status)) {
      await this.recordAttempt(userId, init.sessionId, 'FAILED', response.status);
      throw new UnprocessableEntityException(
        response.message ?? COMMON_ERRORS.INVALID_OR_EXPIRED_OTP,
      );
    }

    const identity = response.data;
    if (!identity?.bvn) {
      await this.recordAttempt(userId, init.sessionId, 'FAILED', 'MISSING_BVN');
      throw new UnprocessableEntityException(COMMON_ERRORS.INVALID_OR_EXPIRED_OTP);
    }

    const returnedFingerprint = fingerprintIdentifier(identity.bvn);
    if (returnedFingerprint !== init.fingerprint) {
      await this.recordAttempt(userId, init.sessionId, 'FAILED', 'BVN_MISMATCH');
      throw new UnprocessableEntityException(COMMON_ERRORS.INVALID_OR_EXPIRED_OTP);
    }

    const duplicate = await this.kycRepository.findByBvnHash(returnedFingerprint);
    if (duplicate && duplicate.userId !== userId) {
      throw new ConflictException('BVN is already linked to another account');
    }

    const firstName = identity.first_name?.trim() ?? '';
    const lastName = identity.last_name?.trim() ?? '';
    const dateOfBirth = identity.dob ? String(identity.dob) : null;

    const result = await this.db.transaction().execute(async (trx) => {
      const existingProfile = await this.kycRepository.findByUserId(userId, trx);
      const profileData = {
        bvnHash: returnedFingerprint,
        bvnFingerprintKeyVersion: appConfig.kyc.fingerprintKeyVersion,
        bvnVerifiedAt: new Date(),
        dateOfBirthEncrypted: dateOfBirth ? sealData(dateOfBirth) : null,
        status: KycStatus.VERIFIED,
        verifiedAt: new Date(),
        providerReference: init.sessionId,
        rejectionReason: null as string | null,
        updatedAt: new Date(),
      };

      let profile;
      if (existingProfile) {
        profile = await this.kycRepository.update(userId, profileData, trx);
      } else {
        profile = await this.kycRepository.create(
          {
            id: newId(),
            userId,
            ninHash: null,
            addressEncrypted: null,
            state: null,
            lga: null,
            submittedAt: null,
            ...profileData,
          } as NewKycProfile,
          trx,
        );
      }

      if (firstName && lastName) {
        await this.kycRepository.updateUserLegalName(
          userId,
          firstName,
          lastName,
          trx,
        );
      }

      const tiered = await this.kycRepository.updateUserKycTier(userId, 1, trx);

      await this.kycRepository.createVerificationAttempt(
        {
          kycProfileId: profile!.id,
          provider: 'mono',
          providerReference: init.sessionId,
          status: 'SUCCEEDED',
        },
        trx,
      );

      await this.auditService.log(
        {
          actorType: ActorType.USER,
          actorId: userId,
          action: 'BVN_VERIFIED',
          resourceType: 'kyc_profile',
          resourceId: profile?.id,
        },
        trx,
      );

      return tiered;
    });

    await this.redisService.del(this.initKey(userId));

    return {
      id: result?.id,
      email: result?.email,
      firstName: result?.firstName,
      lastName: result?.lastName,
      status: result?.status,
      kycTier: result?.kycTier,
    };
  }

  private initKey(userId: string) {
    return `bvn:init:${userId}`;
  }

  private isSuccessfulStatus(status?: string) {
    return status === 'successful' || status === 'success';
  }

  private async recordAttempt(
    userId: string,
    providerReference: string,
    status: string,
    failureCode?: string,
  ) {
    const profile = await this.kycRepository.findByUserId(userId);
    if (!profile) {
      return;
    }
    await this.kycRepository.createVerificationAttempt({
      kycProfileId: profile.id,
      provider: 'mono',
      providerReference,
      status,
      failureCode: failureCode ?? null,
    });
  }

  private async enforceBvnRateLimits(
    userId: string,
    fingerprint: string,
    clientIp: string,
  ) {
    const userKey = `rate_limit:bvn_initiate:${userId}`;
    const fpKey = `rate_limit:bvn_fingerprint:${fingerprint}`;
    const ipKey = `rate_limit:bvn_ip:${clientIp}`;

    for (const key of [userKey, fpKey, ipKey]) {
      const current = await this.redisService.get(key);
      if (current === null) {
        await this.redisService.set(key, '1', BVN_INITIATE_WINDOW);
        continue;
      }
      const count = parseInt(current, 10);
      if (count >= BVN_INITIATE_LIMIT) {
        throw new HttpException(
          {
            message: KYC_ERRORS.BVN_RATE_LIMIT,
            retryAfter: BVN_INITIATE_WINDOW,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await this.redisService.set(
        key,
        (count + 1).toString(),
        BVN_INITIATE_WINDOW,
      );
    }
  }
}
