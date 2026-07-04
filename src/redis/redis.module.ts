import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { appConfig } from '../config/config';

const redisProvider = {
  provide: REDIS_CLIENT,
  useFactory: () => {
    const redisUrl = appConfig.redisUrl;

    const redis = new Redis(redisUrl, {
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redis.on('connect', () => {
      console.log('🔗 Redis connected');
    });

    redis.on('ready', () => {
      console.log('✅ Redis ready to receive commands');
    });

    redis.on('error', (err) => {
      console.error('❌ Redis connection error:', err);
    });

    redis.on('close', () => {
      console.log('📴 Redis connection closed');
    });

    redis.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
    });

    return redis;
  },
  inject: [],
};

@Global()
@Module({
  providers: [redisProvider, RedisService],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
