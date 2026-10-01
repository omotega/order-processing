import z from 'zod';

const transferValidation = {
  transfer: {
    body: z
      .object({
        accountNumber: z.string().min(4).max(20).optional(),
        bankCode: z.string().min(3).max(10).optional(),
        beneficiaryId: z.string().optional(),
        bankName: z.string().optional(),
        amount: z.number().positive().max(100000000),
        description: z.string().min(1).max(200).optional(),
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
  validateTransferAmount: {
    body: z
      .object({
        amount: z.number().positive().max(100000000),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
};

export type TransferDto = {
  body: z.infer<typeof transferValidation.transfer.body>;
  query: z.infer<typeof transferValidation.transfer.query>;
  params: z.infer<typeof transferValidation.transfer.params>;
};

export type ValidateTransferAmountDto = {
  body: z.infer<typeof transferValidation.validateTransferAmount.body>;
  query: z.infer<typeof transferValidation.validateTransferAmount.query>;
  params: z.infer<typeof transferValidation.validateTransferAmount.params>;
};

export default transferValidation;
