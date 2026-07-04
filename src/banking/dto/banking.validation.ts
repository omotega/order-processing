import z from 'zod';

const bankingValidation = {
  transfer: {
    body: z
      .object({
        accountNumber: z.string().min(4).max(20).optional(),
        bankCode: z.string().min(3).max(10).optional(),
        beneficiaryId: z.string().optional(),
        amount: z.number().positive().max(100000000),
        description: z.string().min(1).max(200).optional(),
        idempotencyKey: z.string(),
      })
      .strict()
      .refine(
        (data) => data.beneficiaryId || (data.accountNumber && data.bankCode),
        {
          message:
            'Either beneficiaryId or accountNumber and bankCode are required',
        },
      ),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
};

export type TransferDto = {
  body: z.infer<typeof bankingValidation.transfer.body>;
  query: z.infer<typeof bankingValidation.transfer.query>;
  params: z.infer<typeof bankingValidation.transfer.params>;
};

export default bankingValidation;
