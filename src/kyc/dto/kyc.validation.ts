import z from 'zod';

const kycValidation = {
  submit: {
    body: z
      .object({
        bvn: z.string().length(11).optional(),
        nin: z.string().min(11).max(11).optional(),
        dateOfBirth: z.string().datetime().optional(),
        address: z.string().min(5).max(500).optional(),
        state: z.string().min(2).max(50).optional(),
        lga: z.string().min(2).max(100).optional(),
      })
      .strict()
      .refine((data) => data.bvn || data.nin, {
        message: 'Either BVN or NIN is required',
      }),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
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
        sessionId: z.string().min(1),
        otp: z.string().min(4).max(8),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
  verify: {
    body: z.object({}).strict(),
    query: z.record(z.string(), z.never()),
    params: z
      .object({
        userId: z.string(),
      })
      .strict(),
  },
};

export type SubmitKycDto = {
  body: z.infer<typeof kycValidation.submit.body>;
  query: z.infer<typeof kycValidation.submit.query>;
  params: z.infer<typeof kycValidation.submit.params>;
};

export type InitiateBvnDto = {
  body: z.infer<typeof kycValidation.initiateBvn.body>;
  query: z.infer<typeof kycValidation.initiateBvn.query>;
  params: z.infer<typeof kycValidation.initiateBvn.params>;
};

export type VerifyBvnOtpDto = {
  body: z.infer<typeof kycValidation.verifyBvnOtp.body>;
  query: z.infer<typeof kycValidation.verifyBvnOtp.query>;
  params: z.infer<typeof kycValidation.verifyBvnOtp.params>;
};

export default kycValidation;
