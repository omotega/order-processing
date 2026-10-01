import {
  SetMetadata,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { UserRole } from '@/auth/guards/roles.guard';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const ALLOW_INACTIVE_KEY = 'allowInactive';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const AllowInactive = () => SetMetadata(ALLOW_INACTIVE_KEY, true);

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
