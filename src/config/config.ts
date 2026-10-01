/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-var-requires */
import { z } from 'zod';
import { PaymentProvider } from '@/utils/database.enums';
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
  RABBITMQ_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  RABBITMQ_URL: z.string().default('amqp://localhost:5672'),
  EMAIL_API_KEY: z.string(),
  MONO_SECRET_KEY: z.string(),
  MONO_BASE_URL: z.string(),
  RESEND_API_KEY: z.string(),
  EMAIL_FROM: z.string().default('Order Processing <onboarding@resend.dev>'),
  RESEND_API_URL: z.string().default('https://api.resend.com/emails'),
  PAYMENT_PROVIDER: z
    .nativeEnum(PaymentProvider)
    .default(PaymentProvider.PAYSTACK),
  PAYMENT_PROVIDER_PRIORITY: z
    .string()
    .default('PAYSTACK')
    .transform((value) =>
      value
        .split(',')
        .map((provider) => provider.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.nativeEnum(PaymentProvider)).min(1)),
  PAYMENT_PROVIDER_FAILURE_THRESHOLD: z.coerce
    .number()
    .int()
    .positive()
    .default(5),
  PAYMENT_PROVIDER_COOLDOWN_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  PAYMENT_PROVIDER_HEALTH_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),
  PAYMENT_PROVIDER_PROBE_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(20),
  PAYMENT_PROVIDER_PROBE_LOCK_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15),
  PAYMENT_PROVIDER_CLAIM_LEASE_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(300),
  KAFKA_BROKER: z.string(),
  KAFKA_CLIENT_ID: z.string(),
  KAFKA_CONSUMER_GROUP_PREFIX: z.string(),
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
    enabled: env.RABBITMQ_ENABLED,
    url: env.RABBITMQ_URL,
  },
  emailApiKey: env.EMAIL_API_KEY,
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
  paymentProvider: env.PAYMENT_PROVIDER,
  paymentProviderPriority: env.PAYMENT_PROVIDER_PRIORITY,
  paymentProviderHealth: {
    failureThreshold: env.PAYMENT_PROVIDER_FAILURE_THRESHOLD,
    coolDownSeconds: env.PAYMENT_PROVIDER_COOLDOWN_SECONDS,
    timeoutMs: env.PAYMENT_PROVIDER_HEALTH_TIMEOUT_MS,
    probeIntervalSeconds: env.PAYMENT_PROVIDER_PROBE_INTERVAL_SECONDS,
    probeLockSeconds: env.PAYMENT_PROVIDER_PROBE_LOCK_SECONDS,
  },
  paymentProviderClaimLeaseSeconds: env.PAYMENT_PROVIDER_CLAIM_LEASE_SECONDS,
  kafka: {
    broker: env.KAFKA_BROKER,
    clientId: env.KAFKA_CLIENT_ID,
    consumerGroupPrefix: env.KAFKA_CONSUMER_GROUP_PREFIX,
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
