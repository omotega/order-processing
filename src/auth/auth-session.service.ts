import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { appConfig } from '@/config/config';
import { AuthSessionRepository } from '@database/repository/auth-session.repository';
import { newId } from '@/utils/id';
import { AUTH_ERRORS } from '@/common/errors/index';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AccessTokenPayload = {
  sub: string;
  email: string;
  sid: string;
};

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authSessionRepository: AuthSessionRepository,
  ) {}

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createSession(user: { id: string; email: string }, userAgent?: string) {
    const sessionId = newId();
    const refreshToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await this.authSessionRepository.create({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: this.hashRefreshToken(refreshToken),
      expiresAt,
      userAgent: userAgent ?? null,
    });
    const accessToken = this.signAccessToken({
      sub: user.id,
      email: user.email,
      sid: sessionId,
    });
    return { accessToken, refreshToken, sessionId };
  }

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwtService.sign(payload, {
      expiresIn: appConfig.jwtAccessExpires,
      issuer: 'order-processing-api',
      audience: 'order-processing-client',
    });
  }

  async assertSessionActive(sessionId: string) {
    const session = await this.authSessionRepository.findById(sessionId);
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException(AUTH_ERRORS.SESSION_INVALID);
    }
    return session;
  }

  async refresh(refreshToken: string) {
    const session = await this.authSessionRepository.findByRefreshHash(
      this.hashRefreshToken(refreshToken),
    );
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException(AUTH_ERRORS.SESSION_INVALID);
    }
    const nextRefresh = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    const updated = await this.authSessionRepository.rotate(
      session.id,
      this.hashRefreshToken(nextRefresh),
      expiresAt,
    );
    if (!updated) {
      throw new UnauthorizedException(AUTH_ERRORS.SESSION_INVALID);
    }
    return {
      refreshToken: nextRefresh,
      sessionId: session.id,
    };
  }

  revoke(sessionId: string) {
    return this.authSessionRepository.revoke(sessionId);
  }

  revokeAllForUser(userId: string) {
    return this.authSessionRepository.revokeAllForUser(userId);
  }
}
