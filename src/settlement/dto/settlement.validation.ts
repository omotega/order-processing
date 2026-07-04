import z from 'zod';
import { PaymentProvider } from '../../utils/database.enums';

const settlementValidation = {
  createBatch: {
    body: z
      .object({
        provider: z.nativeEnum(PaymentProvider),
        batchDate: z.string().datetime(),
        totalAmount: z.number().positive(),
        externalBatchId: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
  reconcile: {
    body: z
      .object({
        items: z
          .array(
            z
              .object({
                externalReference: z.string(),
                actualAmount: z.number().positive(),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z
      .object({
        batchId: z.string(),
      })
      .strict(),
  },
};

export type CreateSettlementBatchDto = {
  body: z.infer<typeof settlementValidation.createBatch.body>;
};

export type ReconcileBatchDto = {
  body: z.infer<typeof settlementValidation.reconcile.body>;
  params: z.infer<typeof settlementValidation.reconcile.params>;
};

export default settlementValidation;
