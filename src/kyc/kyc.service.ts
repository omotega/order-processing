import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { newId } from '@/utils/id';
import { KycRepository } from '@database/repository/kyc.repository';
import { AuditService } from '@/audit/audit.service';
import {
  InitiateBvnDto,
  SubmitKycDto,
  VerifyBvnOtpDto,
} from '@/kyc/dto/kyc.validation';
import { ActorType, KycStatus, UserStatus } from '@/utils/database.enums';
import type { NewKycProfile } from '@/database/database.types';
import MonoServices from '@/services/mono/mono';
import { UserRepository } from '@database/repository/user.repository';
import { AccountService } from '@/ledger/account.service';
import { DatabaseService } from '@/database/database.service';
import { RedisService } from '@/redis/redis.service';
import { COMMON_ERRORS, KYC_ERRORS } from '@/common/errors/index';
import { encryptData, hashSensitive } from '@/utils/helpers';

@Injectable()
export class KycService {
  private readonly BVN_INITIATE_LIMIT = 3;
  private readonly BVN_INITIATE_WINDOW = 15 * 60;

  constructor(
    private readonly kycRepository: KycRepository,
    private readonly auditService: AuditService,
    private readonly userRepository: UserRepository,
    private readonly accountService: AccountService,
    private readonly db: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  getProfile(userId: string) {
    return this.kycRepository.findByUserId(userId);
  }

  async initiateBvn(userId: string, payload: InitiateBvnDto['body']) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(COMMON_ERRORS.USER_NOT_FOUND);
    }

    if (user.status === UserStatus.ACTIVE) {
      const profile = await this.kycRepository.findByUserId(userId);
      if (profile?.status === KycStatus.VERIFIED) {
        throw new ConflictException(KYC_ERRORS.ALREADY_VERIFIED);
      }
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(KYC_ERRORS.EMAIL_VERIFICATION_REQUIRED);
    }

    await this.enforceBvnInitiateRateLimit(userId);

    const mono = new MonoServices();
    const response = await mono.initiateBvnLookup({
      bvn: payload.bvn,
      scope: 'identity',
    });

    return response;
  }

  async verifyBvnOtp(userId: string, payload: VerifyBvnOtpDto['body']) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(COMMON_ERRORS.USER_NOT_FOUND);
    }

    const existingProfile = await this.kycRepository.findByUserId(userId);
    if (existingProfile?.status === KycStatus.VERIFIED) {
      throw new ConflictException(KYC_ERRORS.ALREADY_VERIFIED);
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(KYC_ERRORS.EMAIL_VERIFICATION_REQUIRED);
    }

    const mono = new MonoServices();
    const response = await mono.verifyBvnOtp(payload.sessionId, {
      otp: payload.otp,
    });

    const identity = response?.data;
    if (!identity || response?.status === 'failed') {
      throw new UnprocessableEntityException(
        response?.message ?? COMMON_ERRORS.INVALID_OR_EXPIRED_OTP,
      );
    }

    const bvn = identity.bvn ?? null;
    const dateOfBirth = identity.dob ? String(identity.dob) : null;

    const result = await this.db.transaction().execute(async (trx) => {
      const profileData = {
        bvnEncrypted: bvn ? encryptData(bvn) : null,
        bvnHash: bvn ? hashSensitive(bvn) : null,
        ninEncrypted: null as string | null,
        ninHash: null as string | null,
        dateOfBirthEncrypted: dateOfBirth ? encryptData(dateOfBirth) : null,
        addressEncrypted: null as string | null,
        state: null as string | null,
        lga: null as string | null,
        status: KycStatus.VERIFIED,
        verifiedAt: new Date(),
        providerReference: payload.sessionId,
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
            ...profileData,
          } as NewKycProfile,
          trx,
        );
      }

      const activatedUser = await this.userRepository.activateAfterBvn(
        userId,
        trx,
      );

      await this.kycRepository.updateUserKycTier(userId, 1, trx);

      const existingAccount = await this.accountService.findByUserId(
        userId,
        trx,
      );
      if (!existingAccount) {
        await this.accountService.createUserAccount(userId, trx);
      }

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

      return activatedUser;
    });

    return {
      id: result.id,
      email: result.email,
      firstName: result.firstName,
      lastName: result.lastName,
      status: result.status,
      kycTier: result.kycTier,
      phoneVerifiedAt: result.phoneVerifiedAt,
    };
  }

  async submit(userId: string, payload: SubmitKycDto['body']) {
    const existing = await this.kycRepository.findByUserId(userId);

    const bvn = payload.bvn ?? null;
    const nin = payload.nin ?? null;
    const dateOfBirth = payload.dateOfBirth ?? null;
    const address = payload.address ?? null;

    const profileData = {
      bvnEncrypted: bvn ? encryptData(bvn) : null,
      bvnHash: bvn ? hashSensitive(bvn) : null,
      ninEncrypted: nin ? encryptData(nin) : null,
      ninHash: nin ? hashSensitive(nin) : null,
      dateOfBirthEncrypted: dateOfBirth ? encryptData(dateOfBirth) : null,
      addressEncrypted: address ? encryptData(address) : null,
      state: payload.state ?? null,
      lga: payload.lga ?? null,
      status: KycStatus.SUBMITTED,
      submittedAt: new Date(),
      updatedAt: new Date(),
    };

    let profile;
    if (existing) {
      profile = await this.kycRepository.update(userId, profileData);
    } else {
      profile = await this.kycRepository.create({
        id: newId(),
        userId,
        ...profileData,
        verifiedAt: null,
        rejectionReason: null,
        providerReference: null,
      } as NewKycProfile);
    }

    await this.auditService.log({
      actorType: ActorType.USER,
      actorId: userId,
      action: 'KYC_SUBMITTED',
      resourceType: 'kyc_profile',
      resourceId: profile?.id,
    });

    return profile;
  }

  async verify(userId: string, adminId: string, kycTier = 1) {
    const profile = await this.kycRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException(KYC_ERRORS.PROFILE_NOT_FOUND);
    }

    if (profile.status !== KycStatus.SUBMITTED) {
      throw new UnprocessableEntityException(KYC_ERRORS.PROFILE_NOT_SUBMITTED);
    }

    const updated = await this.kycRepository.update(userId, {
      status: KycStatus.VERIFIED,
      verifiedAt: new Date(),
      rejectionReason: null,
    });

    await this.kycRepository.updateUserKycTier(userId, kycTier);

    await this.auditService.log({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'KYC_APPROVED',
      resourceType: 'kyc_profile',
      resourceId: profile.id,
      changes: { after: { kycTier, status: KycStatus.VERIFIED } },
    });

    return updated;
  }

  async reject(userId: string, adminId: string, reason: string) {
    const profile = await this.kycRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException(KYC_ERRORS.PROFILE_NOT_FOUND);
    }

    const updated = await this.kycRepository.update(userId, {
      status: KycStatus.REJECTED,
      rejectionReason: reason,
    });

    await this.auditService.log({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'KYC_REJECTED',
      resourceType: 'kyc_profile',
      resourceId: profile.id,
      changes: { after: { reason } },
    });

    return updated;
  }

  private async enforceBvnInitiateRateLimit(userId: string) {
    const key = `rate_limit:bvn_initiate:${userId}`;
    const current = await this.redisService.get(key);

    if (current === null) {
      await this.redisService.set(key, '1', this.BVN_INITIATE_WINDOW);
      return;
    }

    const count = parseInt(current, 10);
    if (count >= this.BVN_INITIATE_LIMIT) {
      throw new HttpException(
        {
          message: KYC_ERRORS.BVN_RATE_LIMIT,
          retryAfter: this.BVN_INITIATE_WINDOW,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.redisService.set(
      key,
      (count + 1).toString(),
      this.BVN_INITIATE_WINDOW,
    );
  }
}
