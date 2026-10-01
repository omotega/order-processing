import { ConsoleLogger } from '@nestjs/common';
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { isProduction } from '@/config/config';

const LOG_DIR = join(process.cwd(), 'logs');
const LOG_FILE = join(LOG_DIR, 'dev.log');

export class FileLogger extends ConsoleLogger {
  constructor() {
    super();
    if (!isProduction) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  log(message: unknown, ...optionalParams: unknown[]) {
    super.log(message, ...optionalParams);
    this.writeToFile('log', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    super.error(message, ...optionalParams);
    this.writeToFile('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    super.warn(message, ...optionalParams);
    this.writeToFile('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    super.debug(message, ...optionalParams);
    this.writeToFile('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    super.verbose(message, ...optionalParams);
    this.writeToFile('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]) {
    super.fatal(message, ...optionalParams);
    this.writeToFile('fatal', message, optionalParams);
  }

  private writeToFile(
    level: string,
    message: unknown,
    optionalParams: unknown[],
  ) {
    if (isProduction) {
      return;
    }

    const lastParam = optionalParams[optionalParams.length - 1];
    const context = typeof lastParam === 'string' ? lastParam : this.context;
    const extras =
      typeof lastParam === 'string'
        ? optionalParams.slice(0, -1)
        : optionalParams;

    try {
      appendFileSync(
        LOG_FILE,
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          level,
          context,
          message,
          ...(extras.length === 1
            ? { meta: extras[0] }
            : extras.length > 0
              ? { meta: extras }
              : {}),
        })}\n`,
      );
    } catch {
      // File logging must never crash the process.
    }
  }
}
