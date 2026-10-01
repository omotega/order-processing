import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { LoginDto, RegisterDto } from '@/auth/dto/auth.validation';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '@/auth/strategies/jwt.strategy';
import { UserRole } from '@/auth/guards/roles.guard';
import { UserRepository } from '@database/repository/user.repository';
import type { NewUser } from '@/database/database.types';
import { UserStatus } from '@/utils/database.enums';
import { EmailService } from '@/auth/email.service';
import { newId } from '@/utils/id';
import { AUTH_ERRORS, COMMON_ERRORS } from '@/common/errors/index';
import { AccountService } from '@/ledger/account.service';
import { DatabaseService } from '@/database/database.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userRepository: UserRepository,
    private readonly emailService: EmailService,
    private readonly accountService: AccountService,
    private readonly db: DatabaseService,
  ) {}

  async register(payload: RegisterDto['body']) {
    const { firstName, lastName, email, phone, password } = payload;

    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictException(AUTH_ERRORS.EMAIL_ALREADY_EXISTS);
    }

    const userId = newId();
    const hashedPassword = await argon2.hash(password);

    const user = await this.db.transaction().execute(async (trx) => {
      const created = await this.userRepository.create(
        {
          id: userId,
          firstName,
          lastName,
          email,
          phone: phone ?? null,
          password: hashedPassword,
          role: UserRole.USER,
          status: UserStatus.PENDING_VERIFICATION,
          updatedAt: new Date(),
        } as NewUser,
        trx,
      );
      await this.accountService.createUserAccount(userId, trx);
      return created;
    });

    // this.emailService.queueRegistrationOtp(user);

    return {
      user,
    };
  }

  async login(payload: LoginDto['body']) {
    const { email, password } = payload;

    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }

    const passwordMatch = await argon2.verify(user.password, password);
    if (!passwordMatch) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }

    await this.userRepository.updateLastLogin(user.id);

    const payload_jwt: JwtPayload = {
      sub: user.id,
      email: user.email,
    };

    const token = this.jwtService.sign(payload_jwt);

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        status: user.status,
        createdAt: user.createdAt,
        role: user.role,
        kycTier: user.kycTier,
      },
      token,
    };
  }

  async validateUser(userId: string) {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new UnauthorizedException(COMMON_ERRORS.USER_NOT_FOUND);
    }

    return user;
  }

  verifyEmail(email: string, otp: string) {
    return this.emailService.verifyEmail(email, otp);
  }

  resendVerificationEmail(email: string) {
    return this.emailService.resendOtp(email);
  }
}
