import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserStatus } from '@/utils/database.enums';
import { GUARD_ERRORS } from '@/common/errors/index';

@Injectable()
export class ActiveUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException(GUARD_ERRORS.AUTHENTICATION_REQUIRED);
    }

    console.log('user', user);

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(GUARD_ERRORS.ACCOUNT_NOT_ACTIVATED);
    }

    return true;
  }
}
