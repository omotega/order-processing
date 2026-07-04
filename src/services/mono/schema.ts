import { z } from 'zod';

export const initiateBvnLookupSchema = z.object({
  bvn: z.string().regex(/^\d{11}$/, 'BVN must be 11 digits'),
  scope: z.enum(['identity', 'bank_accounts']).optional(),
});

export type InitiateBvnLookupType = z.infer<typeof initiateBvnLookupSchema>;

export const verifyBvnOtpSchema = z.object({
  otp: z.string().min(4).max(8),
});

export type VerifyBvnOtpType = z.infer<typeof verifyBvnOtpSchema>;

export const monoInitiateResponseSchema = z
  .object({
    status: z.string().optional(),
    message: z.string().optional(),
    data: z
      .object({
        session_id: z.string(),
        methods: z
          .array(
            z.object({
              method: z.string(),
              hint: z.string().optional(),
            }),
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type MonoInitiateResponseType = z.infer<
  typeof monoInitiateResponseSchema
>;

export const monoVerifyResponseSchema = z
  .object({
    status: z.string().optional(),
    message: z.string().optional(),
    data: z
      .object({
        bvn: z.string().optional(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        dob: z.string().optional(),
        phone_number: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type MonoVerifyResponseType = z.infer<typeof monoVerifyResponseSchema>;
