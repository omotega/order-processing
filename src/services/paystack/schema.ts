import { z } from 'zod';

export const validateAccountNumberSchema = z.object({
  accountNumber: z.string(),
  bankCode: z.string(),
});

export type validateAccountNumberType = z.infer<
  typeof validateAccountNumberSchema
>;

export const createTransferRecipientSchema = z.object({
  type: z.string(),
  name: z.string(),
  account_number: z.string(),
  bank_code: z.string(),
  metadata: z
    .object({
      custom_fields: z.array(
        z.object({
          value: z.string(),
          key: z.string(),
        }),
      ),
    })
    .optional(),
  currency: z.string().optional(),
});

export const createTransferRecipientResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  data: z.object({
    active: z.boolean(),
    createdAt: z.string(),
    currency: z.string(),
    domain: z.string(),
    id: z.number(),
    integration: z.number(),
    name: z.string(),
    recipient_code: z.string(),
    type: z.string(),
    updatedAt: z.string(),
    is_deleted: z.boolean(),
    details: z.object({
      authorization_code: z.string().nullable(),
      account_number: z.string(),
      account_name: z.string().nullable(),
      bank_code: z.string(),
      bank_name: z.string(),
    }),
  }),
});

export type createTransferRecipientResponseType = z.infer<
  typeof createTransferRecipientResponseSchema
>;

export type createTransferRecipientType = z.infer<
  typeof createTransferRecipientSchema
>;

export const initiateTransferSchema = z.object({
  source: z.string(),
  amount: z.number(),
  reference: z.string(),
  recipient: z.string(),
  reason: z.string(),
});

export type initiateTransferType = z.infer<typeof initiateTransferSchema>;

export const initiateTransferResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  data: z.object({
    transfersessionid: z.array(z.any()),
    transfertrials: z.array(z.any()),
    domain: z.string(),
    amount: z.number(),
    currency: z.string(),
    reference: z.string(),
    source: z.string(),
    source_details: z.any().nullable(),
    reason: z.string(),
    status: z.string(),
    failures: z.any().nullable(),
    transfer_code: z.string(),
    titan_code: z.any().nullable(),
    transferred_at: z.any().nullable(),
    id: z.number(),
    integration: z.number(),
    request: z.number(),
    recipient: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

export type initiateTransferResponseType = z.infer<
  typeof initiateTransferResponseSchema
>;

export const transferSchema = z.object({
  transfer_code: z.string(),
  otp: z.string(),
});

export type transferType = z.infer<typeof transferSchema>;

export const verifyTransferSchema = z.object({
  reference: z.string(),
});

export type verifyTransferType = z.infer<typeof verifyTransferSchema>;
