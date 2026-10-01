import { PaymentProvider } from '@/utils/database.enums';
import {
  InitiateTransferInput,
  InitiateTransferResult,
  ListBanksResult,
  ValidateAccountInput,
  ValidateAccountResult,
  VerifyTransferInput,
  VerifyTransferResult,
} from '@/payment-providers/payment-provider.types';

export interface IPaymentProviderAdapter {
  readonly provider: PaymentProvider;

  /** Lightweight reachability check for background probes only. */
  ping?(): Promise<boolean>;

  listBanks(): Promise<ListBanksResult>;
  validateAccount(input: ValidateAccountInput): Promise<ValidateAccountResult>;
  initiateTransfer(
    input: InitiateTransferInput,
  ): Promise<InitiateTransferResult>;
  verifyTransfer?(input: VerifyTransferInput): Promise<VerifyTransferResult>;
}
