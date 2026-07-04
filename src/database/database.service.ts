import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { appConfig } from '../config/config';
import type { Database } from './database.types';

@Injectable()
export class DatabaseService
  extends Kysely<Database>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor() {
    const pool = new Pool({ connectionString: appConfig.databaseUrl });
    super({ dialect: new PostgresDialect({ pool }) });
    this.pool = pool;
  }

  async onModuleInit() {
    try {
      await sql`select 1`.execute(this);
      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.destroy();
    await this.pool.end();
    this.logger.log('Database connection closed');
  }
}
