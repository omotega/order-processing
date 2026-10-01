import { z } from 'zod';
import { WebhookProvider } from '@/utils/database.enums';
import { paystackWebhookSchema } from '@/webhook/dto/webhook.validation';

export const webhookJobSchema = z.object({
  processorId: z.nativeEnum(WebhookProvider),
  eventId: z.string(),
  webhookEventId: z.string(),
  event: z.string(),
  reference: z.string(),
  payload: paystackWebhookSchema,
  receivedAt: z.string(),
  correlationId: z.string(),
  webhookRequestCorrelationId: z.string(),
});

export type WebhookJob = z.infer<typeof webhookJobSchema>;
