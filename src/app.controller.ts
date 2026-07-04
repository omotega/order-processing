import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { RedisService } from './redis/redis.service';
import { Public } from './auth/decorators/auth.decorators';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly redisService: RedisService,
  ) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  async getHealth() {
    const redisHealth = await this.redisService.healthCheck();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        redis: redisHealth,
        database: 'connected', // You can add Prisma health check here too
      },
    };
  }

  @Public()
  @Get('redis/test')
  async testRedis() {
    // Test basic Redis operations
    const testKey = 'test:connection';
    const testValue = `Connection test at ${new Date().toISOString()}`;

    try {
      // Set a test value
      await this.redisService.set(testKey, testValue, 60); // 60 seconds TTL

      // Get the value back
      const retrievedValue = await this.redisService.get(testKey);

      // Check TTL
      const ttl = await this.redisService.ttl(testKey);

      return {
        success: true,
        message: 'Redis connection test successful',
        test: {
          set: testValue,
          retrieved: retrievedValue,
          ttl: ttl,
          match: testValue === retrievedValue,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Redis connection test failed',
        error: error.message,
      };
    }
  }
}
