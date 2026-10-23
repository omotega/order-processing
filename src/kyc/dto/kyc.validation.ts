import { z } from 'zod';

const kycValidation = {
  initiateBvn: {
    body: z
      .object({
        bvn: z.string().regex(/^\d{11}$/, 'BVN must be 11 digits'),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
  verifyBvnOtp: {
    body: z
      .object({
        otp: z.string().min(4).max(8),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
};

export type InitiateBvnDto = {
  body: z.infer<typeof kycValidation.initiateBvn.body>;
};

export type VerifyBvnOtpDto = {
  body: z.infer<typeof kycValidation.verifyBvnOtp.body>;
};

export default kycValidation;
