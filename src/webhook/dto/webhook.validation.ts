import { z } from 'zod';

export const paystackWebhookSchema = z.object({
  event: z.string(),
  data: z.object({
    reference: z.string(),
    amount: z.number(),
    currency: z.string(),
    status: z.string(),
    recipient: z
      .object({
        recipient_code: z.string(),
        details: z.object({
          account_number: z.string(),
          bank_code: z.string(),
          account_name: z.string(),
        }),
      })
      .optional(),
    transfer: z
      .object({
        transfer_code: z.string(),
        amount: z.number(),
        currency: z.string(),
        status: z.string(),
        reason: z.string().optional(),
      })
      .optional(),
    customer: z
      .object({
        email: z.string(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
      })
      .optional(),
    authorization: z
      .object({
        authorization_code: z.string(),
        card_type: z.string(),
        last4: z.string(),
        exp_month: z.string(),
        exp_year: z.string(),
      })
      .optional(),
  }),
});

export const webhookValidation = {
  paystack: {
    body: paystackWebhookSchema,
  },
};

export type PaystackWebhookPayload = z.infer<typeof paystackWebhookSchema>;
