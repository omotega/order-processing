import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { nanoid } from 'nanoid';
import { KycRepository } from './kyc.repository';
import { AuditService } from '../audit/audit.service';
import {
  InitiateBvnDto,
  SubmitKycDto,
  VerifyBvnOtpDto,
} from './dto/kyc.validation';
import { ActorType, KycStatus } from '../utils/database.enums';
import type { NewKycProfile } from '../database/database.types';
import MonoServices from '../services/mono/mono';
import { UserRepository } from '../auth/user.repository';
import { AccountService } from '../ledger/account.service';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

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
      throw new NotFoundException('User not found');
    }

    if (user.kycStatus === KycStatus.VERIFIED) {
      throw new ConflictException('KYC is already verified');
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(
        'Email verification required before BVN lookup',
      );
    }

    await this.enforceBvnInitiateRateLimit(userId);

    const mono = new MonoServices();
    const response = await mono.initiateBvnLookup({
      bvn: payload.bvn,
      scope: 'identity',
    });

    return response;

    // const sessionId = response?.data?.session_id;
    // if (!sessionId) {
    //   throw new UnprocessableEntityException(
    //     response?.message ?? 'Failed to initiate BVN lookup',
    //   );
    // }

    // return {
    //   sessionId,
    //   methods: response?.data?.methods ?? [],
    //   message: response?.message ?? 'OTP sent',
    // };
  }

  async verifyBvnOtp(userId: string, payload: VerifyBvnOtpDto['body']) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.kycStatus === KycStatus.VERIFIED) {
      throw new ConflictException('KYC is already verified');
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(
        'Email verification required before BVN lookup',
      );
    }

    const mono = new MonoServices();
    const response = await mono.verifyBvnOtp(payload.sessionId, {
      otp: payload.otp,
    });

    const identity = response?.data;
    if (!identity || response?.status === 'failed') {
      throw new UnprocessableEntityException(
        response?.message ?? 'Invalid or expired OTP',
      );
    }

    const bvn = identity.bvn ?? '';
    const dateOfBirth = identity.dob ? new Date(identity.dob) : new Date();

    const result = await this.db.transaction().execute(async (trx) => {
      const existingProfile = await this.kycRepository.findByUserId(
        userId,
        trx,
      );

      const profileData = {
        bvn,
        nin: '',
        dateOfBirth,
        address: '',
        state: '',
        lga: '',
        status: KycStatus.VERIFIED,
        verifiedAt: new Date(),
        providerReference: payload.sessionId,
        rejectionReason: '',
        updatedAt: new Date(),
      };

      let profile;
      if (existingProfile) {
        profile = await this.kycRepository.update(userId, profileData, trx);
      } else {
        profile = await this.kycRepository.create(
          {
            id: nanoid(),
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

      await this.kycRepository.updateUserKyc(
        userId,
        KycStatus.VERIFIED,
        1,
        trx,
      );

      const existingAccount = await this.accountService.findByUserId(
        userId,
        trx,
      );
      if (!existingAccount) {
        await this.accountService.createUserWallet(userId, trx);
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
      isActive: result.isActive,
      kycStatus: result.kycStatus,
      kycTier: result.kycTier,
      phoneVerifiedAt: result.phoneVerifiedAt,
    };
  }

  async submit(userId: string, payload: SubmitKycDto['body']) {
    const existing = await this.kycRepository.findByUserId(userId);

    const profileData = {
      bvn: payload.bvn ?? '',
      nin: payload.nin ?? '',
      dateOfBirth: payload.dateOfBirth
        ? new Date(payload.dateOfBirth)
        : new Date(),
      address: payload.address ?? '',
      state: payload.state ?? '',
      lga: payload.lga ?? '',
      status: KycStatus.SUBMITTED,
      updatedAt: new Date(),
    };

    let profile;
    if (existing) {
      profile = await this.kycRepository.update(userId, profileData);
    } else {
      profile = await this.kycRepository.create({
        id: nanoid(),
        userId,
        ...profileData,
        verifiedAt: new Date(),
        rejectionReason: '',
        providerReference: '',
      } as NewKycProfile);
    }

    await this.kycRepository.updateUserKyc(userId, KycStatus.SUBMITTED, 0);

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
      throw new NotFoundException('KYC profile not found');
    }

    if (profile.status !== KycStatus.SUBMITTED) {
      throw new UnprocessableEntityException(
        'KYC profile is not in submitted state',
      );
    }

    const updated = await this.kycRepository.update(userId, {
      status: KycStatus.VERIFIED,
      verifiedAt: new Date(),
      rejectionReason: '',
    });

    await this.kycRepository.updateUserKyc(userId, KycStatus.VERIFIED, kycTier);

    await this.auditService.log({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'KYC_APPROVED',
      resourceType: 'kyc_profile',
      resourceId: profile.id,
      after: { kycTier, status: KycStatus.VERIFIED },
    });

    return updated;
  }

  async reject(userId: string, adminId: string, reason: string) {
    const profile = await this.kycRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('KYC profile not found');
    }

    const updated = await this.kycRepository.update(userId, {
      status: KycStatus.REJECTED,
      rejectionReason: reason,
    });

    await this.kycRepository.updateUserKyc(userId, KycStatus.REJECTED, 0);

    await this.auditService.log({
      actorType: ActorType.ADMIN,
      actorId: adminId,
      action: 'KYC_REJECTED',
      resourceType: 'kyc_profile',
      resourceId: profile.id,
      after: { reason },
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
          message: 'Too many BVN lookup attempts. Try again later.',
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
