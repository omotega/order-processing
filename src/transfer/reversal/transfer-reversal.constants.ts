import { PaymentProcessingStatus } from '@/utils/database.enums';

export const TRANSFER_REVERSAL_ALLOWED_STATUSES = {
  SUBMIT_REJECTED: [PaymentProcessingStatus.SUBMITTING],
  VERIFY_REJECTED: [
    PaymentProcessingStatus.AWAITING_SETTLEMENT,
    PaymentProcessingStatus.UNKNOWN,
    PaymentProcessingStatus.SUBMITTING,
  ],
  WEBHOOK_REJECTED: [
    PaymentProcessingStatus.READY_FOR_SUBMISSION,
    PaymentProcessingStatus.SUBMITTING,
    PaymentProcessingStatus.UNKNOWN,
    PaymentProcessingStatus.AWAITING_SETTLEMENT,
  ],
} as const satisfies Record<string, readonly PaymentProcessingStatus[]>;
