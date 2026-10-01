import z from 'zod';

const bankingValidation = {
  verifyAccountNumber: {
    body: z
      .object({
        accountNumber: z.string().min(10).max(10),
        bankCode: z.string().min(3).max(10),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
};

export type VerifyAccountNumberDto = {
  body: z.infer<typeof bankingValidation.verifyAccountNumber.body>;
  query: z.infer<typeof bankingValidation.verifyAccountNumber.query>;
  params: z.infer<typeof bankingValidation.verifyAccountNumber.params>;
};

export default bankingValidation;
