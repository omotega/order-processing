import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleInit() {
    try {
      // Test the connection
      await this.redis.ping();
      this.logger.log('✅ Redis connection established successfully');

      // Log Redis server info
      const info = await this.redis.info('server');
      const version = info.match(/redis_version:([^\r\n]*)/)?.[1];
      this.logger.log(`🔗 Connected to Redis server version: ${version}`);
    } catch (error) {
      this.logger.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.redis.quit();
      this.logger.log('📴 Redis connection closed');
    } catch (error) {
      this.logger.error('Error closing Redis connection:', error);
    }
  }

  // Basic Redis operations
  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error) {
      this.logger.error(`Error getting key ${key}:`, error);
      throw error;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<'OK'> {
    try {
      if (ttl) {
        return await this.redis.setex(key, ttl, value);
      }
      return await this.redis.set(key, value);
    } catch (error) {
      this.logger.error(`Error setting key ${key}:`, error);
      throw error;
    }
  }

  async del(key: string): Promise<number> {
    try {
      return await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Error deleting key ${key}:`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<number> {
    try {
      return await this.redis.exists(key);
    } catch (error) {
      this.logger.error(`Error checking existence of key ${key}:`, error);
      throw error;
    }
  }

  async expire(key: string, seconds: number): Promise<number> {
    try {
      return await this.redis.expire(key, seconds);
    } catch (error) {
      this.logger.error(`Error setting expiration for key ${key}:`, error);
      throw error;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      this.logger.error(`Error getting TTL for key ${key}:`, error);
      throw error;
    }
  }

  // Hash operations (useful for user sessions, etc.)
  async hget(key: string, field: string): Promise<string | null> {
    try {
      return await this.redis.hget(key, field);
    } catch (error) {
      this.logger.error(
        `Error getting hash field ${field} from key ${key}:`,
        error,
      );
      throw error;
    }
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    try {
      return await this.redis.hset(key, field, value);
    } catch (error) {
      this.logger.error(
        `Error setting hash field ${field} in key ${key}:`,
        error,
      );
      throw error;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.redis.hgetall(key);
    } catch (error) {
      this.logger.error(
        `Error getting all hash fields from key ${key}:`,
        error,
      );
      throw error;
    }
  }

  async hdel(key: string, field: string): Promise<number> {
    try {
      return await this.redis.hdel(key, field);
    } catch (error) {
      this.logger.error(
        `Error deleting hash field ${field} from key ${key}:`,
        error,
      );
      throw error;
    }
  }

  // List operations (useful for queues, etc.)
  async lpush(key: string, ...values: string[]): Promise<number> {
    try {
      return await this.redis.lpush(key, ...values);
    } catch (error) {
      this.logger.error(`Error pushing to list ${key}:`, error);
      throw error;
    }
  }

  async rpop(key: string): Promise<string | null> {
    try {
      return await this.redis.rpop(key);
    } catch (error) {
      this.logger.error(`Error popping from list ${key}:`, error);
      throw error;
    }
  }

  async llen(key: string): Promise<number> {
    try {
      return await this.redis.llen(key);
    } catch (error) {
      this.logger.error(`Error getting length of list ${key}:`, error);
      throw error;
    }
  }

  // Set operations (useful for unique collections)
  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.redis.sadd(key, ...members);
    } catch (error) {
      this.logger.error(`Error adding to set ${key}:`, error);
      throw error;
    }
  }

  async smembers(key: string): Promise<string[]> {
    try {
      return await this.redis.smembers(key);
    } catch (error) {
      this.logger.error(`Error getting members of set ${key}:`, error);
      throw error;
    }
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.redis.srem(key, ...members);
    } catch (error) {
      this.logger.error(`Error removing from set ${key}:`, error);
      throw error;
    }
  }

  // Cache helper methods for JSON data
  async setJson(key: string, value: any, ttl?: number): Promise<'OK'> {
    try {
      const jsonString = JSON.stringify(value);
      return await this.set(key, jsonString, ttl);
    } catch (error) {
      this.logger.error(`Error setting JSON for key ${key}:`, error);
      throw error;
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const value = await this.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      this.logger.error(`Error getting JSON for key ${key}:`, error);
      throw error;
    }
  }

  // Rate limiting helper
  async rateLimit(
    key: string,
    limit: number,
    window: number,
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    try {
      const current = await this.redis.incr(key);

      if (current === 1) {
        await this.redis.expire(key, window);
      }

      const ttl = await this.redis.ttl(key);
      const resetTime = Date.now() + ttl * 1000;

      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
        resetTime,
      };
    } catch (error) {
      this.logger.error(`Error in rate limiting for key ${key}:`, error);
      throw error;
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: string; latency: number }> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;

      return {
        status: 'healthy',
        latency,
      };
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return {
        status: 'unhealthy',
        latency: -1,
      };
    }
  }

  // Get raw Redis instance for advanced operations
  getClient(): Redis {
    return this.redis;
  }
}
