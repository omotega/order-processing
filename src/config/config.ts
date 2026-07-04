/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-var-requires */
import { z } from 'zod';
require('dotenv').config();

const envVariables = z.object({
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string(),
  JWT_EXPIRES: z.string(),
  REDIS_URL: z.string(),
  ENCRYPTION_SECRET_KEY: z.string(),
  ENCRYPTION_SECRET_IV: z.string(),
  ENCRYPTION_METHOD: z.string(),
  TEST_DATABASE_URL: z.string(),
  APP_ENV: z.string(),
  PAYSTACK_SECRET_KEY: z.string(),
  PAYSTACK_BASE_URL: z.string(),
  RABBITMQ_URL: z.string().default('amqp://localhost:5672'),
  EMAIL_API_KEY: z.string(),
  FLUTTERWAVE_CLIENT_ID: z.string(),
  FLUTTERWAVE_CLIENT_SECRET: z.string(),
  FLUTTERWAVE_ENCRYPTION_KEY: z.string(),
  MONO_SECRET_KEY: z.string(),
  MONO_BASE_URL: z.string().default('https://api.withmono.com'),
  RESEND_API_KEY: z.string(),
  EMAIL_FROM: z.string().default('Order Processing <onboarding@resend.dev>'),
  RESEND_API_URL: z.string().default('https://api.resend.com/emails'),
});

let env = envVariables.parse(process.env);
export function validate(config: Record<string, unknown>) {
  try {
    const response = envVariables.parse(config);
    return response;
  } catch (error: any) {
    throw new Error(`Config validation error: ${JSON.stringify(error.issues)}`);
  }
}

export const appConfig = {
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  jwtExpires: env.JWT_EXPIRES,
  redisUrl: env.REDIS_URL,
  encryption: {
    secretKey: env.ENCRYPTION_SECRET_KEY,
    secretIV: env.ENCRYPTION_SECRET_IV,
    encryptionMethod: env.ENCRYPTION_METHOD,
  },
  testDatabaseUrl: env.TEST_DATABASE_URL,
  appEnv: env.APP_ENV,
  paystack: {
    secretKey: env.PAYSTACK_SECRET_KEY,
    baseUrl: env.PAYSTACK_BASE_URL,
  },
  rabbitmq: {
    url: env.RABBITMQ_URL,
  },
  emailApiKey: env.EMAIL_API_KEY,
  flutterWave: {
    clientId: env.FLUTTERWAVE_CLIENT_ID,
    clientSecret: env.FLUTTERWAVE_CLIENT_SECRET,
    encryptionKey: env.FLUTTERWAVE_ENCRYPTION_KEY,
  },
  mono: {
    secretKey: env.MONO_SECRET_KEY,
    baseUrl: env.MONO_BASE_URL,
  },
  email: {
    apiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM,
  },
  resendService: {
    apiKey: env.RESEND_API_KEY,
    baseUrl: env.RESEND_API_URL,
  },
};

export const isProduction = appConfig.appEnv === 'production';
export const isLocal = appConfig.appEnv === 'development';
export const isStaging = appConfig.appEnv === 'staging';
export const isTest = appConfig.appEnv === 'test';
export const isProdOrStage = isProduction || isStaging;
export const isLocalOrTest = isLocal || isTest;
export const isLocalOrStaging = isLocal || isStaging;
export const isLocalOrTestorStaging = isLocal || isTest || isStaging;
