import { z } from 'zod';

export const PAYSTACK_TRANSFER_EVENTS = [
  'transfer.success',
  'transfer.failed',
  'transfer.reversed',
] as const;

export type PaystackTransferEvent = (typeof PAYSTACK_TRANSFER_EVENTS)[number];

const paystackIntegrationSchema = z.object({
  id: z.number(),
  is_live: z.boolean(),
  business_name: z.string(),
  logo_path: z.string().optional(),
});

const paystackRecipientDetailsSchema = z.object({
  authorization_code: z.string().nullable().optional(),
  account_number: z.string().optional(),
  account_name: z.string().nullable().optional(),
  bank_code: z.string().optional(),
  bank_name: z.string().optional(),
});

const paystackRecipientSchema = z.object({
  active: z.boolean().optional(),
  createdAt: z.string().optional(),
  created_at: z.string().optional(),
  currency: z.string().optional(),
  description: z.string().nullable().optional(),
  domain: z.string().optional(),
  email: z.string().optional(),
  id: z.number().optional(),
  integration: z.number().optional(),
  metadata: z.unknown().nullable().optional(),
  name: z.string().optional(),
  recipient_code: z.string().optional(),
  type: z.string().optional(),
  updatedAt: z.string().optional(),
  updated_at: z.string().optional(),
  is_deleted: z.boolean().optional(),
  details: paystackRecipientDetailsSchema.optional(),
});

const paystackSessionSchema = z.object({
  provider: z.string().nullable(),
  id: z.string().nullable(),
});

const paystackTransferDataSchema = z.object({
  id: z.union([z.string(), z.number()]),
  reference: z.string().min(1),
  amount: z.number().int().nonnegative(),
  currency: z.literal('NGN'),
  status: z.string().min(1),
  createdAt: z.string().optional(),
  created_at: z.string().optional(),
  updatedAt: z.string().optional(),
  updated_at: z.string().optional(),
  domain: z.string().optional(),
  failures: z.unknown().nullable().optional(),
  integration: paystackIntegrationSchema.optional(),
  reason: z.string().nullable().optional(),
  source: z.string().optional(),
  source_details: z.unknown().nullable().optional(),
  titan_code: z.string().nullable().optional(),
  transfer_code: z.string().optional(),
  transferred_at: z.string().nullable().optional(),
  recipient: paystackRecipientSchema.optional(),
  session: paystackSessionSchema.optional(),
  fee_charged: z.number().optional(),
  gateway_response: z.unknown().nullable().optional(),
});

export const paystackWebhookSchema = z.object({
  event: z.string().min(1),
  data: paystackTransferDataSchema,
});

export const webhookValidation = {
  paystack: {
    body: paystackWebhookSchema,
  },
};

export type PaystackWebhookPayload = z.infer<typeof paystackWebhookSchema>;

export function isPaystackTransferEvent(
  event: string,
): event is PaystackTransferEvent {
  return (PAYSTACK_TRANSFER_EVENTS as readonly string[]).includes(event);
}
