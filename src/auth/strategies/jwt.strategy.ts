import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { appConfig } from 'src/config/config';
import { AuthService } from '@/auth/auth.service';

export interface JwtPayload {
  sub: string;
  email: string;
  sid: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: appConfig.jwtSecret,
      issuer: 'order-processing-api',
      audience: 'order-processing-client',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sid) {
      throw new UnauthorizedException();
    }
    return this.authService.validateUser(payload.sub, payload.sid);
  }
}
