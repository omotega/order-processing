import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { KycStatus } from '../../utils/database.enums';

@Injectable()
export class ActiveUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is not activated');
    }

    if (user.kycStatus !== KycStatus.VERIFIED) {
      throw new ForbiddenException('KYC verification required');
    }

    return true;
  }
}
