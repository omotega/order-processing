import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return true; // Let JWT guard handle authentication
    }

    const key = `rate_limit:transfer:${user.id}`;
    const limit = 5; // 5 transfers per hour
    const window = 3600; // 1 hour in seconds

    try {
      const current = await this.redisService.get(key);

      if (current === null) {
        // First request in the window
        await this.redisService.set(key, '1', window);
        return true;
      }

      const count = parseInt(current, 10);

      if (count >= limit) {
        throw new HttpException(
          {
            message: 'Rate limit exceeded. Maximum 5 transfers per hour.',
            retryAfter: window,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Increment counter
      await this.redisService.set(key, (count + 1).toString(), window);
      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      // If Redis is down, allow the request (fail open)
      console.error('Rate limiting error:', error);
      return true;
    }
  }
}
