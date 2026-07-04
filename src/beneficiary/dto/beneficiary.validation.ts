import z from 'zod';

const beneficiaryValidation = {
  create: {
    body: z
      .object({
        accountNumber: z.string().min(4).max(20),
        bankCode: z.string().min(3).max(10),
        bankName: z.string().min(1).max(100).optional(),
        accountName: z.string().min(1).max(200),
        nickname: z.string().min(1).max(50).optional(),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
  delete: {
    body: z.object({}).strict(),
    query: z.record(z.string(), z.never()),
    params: z
      .object({
        id: z.string(),
      })
      .strict(),
  },
};

export type CreateBeneficiaryDto = {
  body: z.infer<typeof beneficiaryValidation.create.body>;
  query: z.infer<typeof beneficiaryValidation.create.query>;
  params: z.infer<typeof beneficiaryValidation.create.params>;
};

export type DeleteBeneficiaryDto = {
  body: z.infer<typeof beneficiaryValidation.delete.body>;
  query: z.infer<typeof beneficiaryValidation.delete.query>;
  params: z.infer<typeof beneficiaryValidation.delete.params>;
};

export default beneficiaryValidation;
