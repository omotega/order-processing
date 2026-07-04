import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { LoginDto, RegisterDto } from './dto/auth.validation';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './strategies/jwt.strategy';
import { UserRole } from './guards/roles.guard';
import { UserRepository } from './user.repository';
import type { NewUser } from '../database/database.types';
import { EmailService } from './email.service';
import { nanoid } from 'nanoid';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userRepository: UserRepository,
    private readonly emailService: EmailService,
  ) {}

  async register(payload: RegisterDto['body']) {
    const { firstName, lastName, email, phone, password } = payload;

    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await argon2.hash(password);

    const user = await this.userRepository.create({
      id: nanoid(),
      firstName,
      lastName,
      email,
      phone,
      password: hashedPassword,
      role: UserRole.USER,
      isActive: false,
      pin: null,
      updatedAt: new Date(),
    } as NewUser);

    this.emailService.queueRegistrationOtp(user);

    return {
      user,
    };
  }

  async login(payload: LoginDto['body']) {
    const { email, password } = payload;

    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await argon2.verify(user.password, password);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
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
        isActive: user.isActive,
        createdAt: user.createdAt,
        role: user.role,
        kycStatus: user.kycStatus,
        kycTier: user.kycTier,
      },
      token,
    };
  }

  async validateUser(userId: string) {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
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
