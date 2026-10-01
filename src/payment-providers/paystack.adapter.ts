import { Injectable, Logger } from '@nestjs/common';
import { appConfig } from '@/config/config';
import PaystackServices from '@/services/paystack/paystack';
import { PaymentProvider } from '@/utils/database.enums';
import { IPaymentProviderAdapter } from '@/payment-providers/payment-provider.interface';
import {
  InitiateTransferInput,
  InitiateTransferResult,
  ListBanksResult,
  ProviderSubmitStep,
  ValidateAccountInput,
  ValidateAccountResult,
  VerifyTransferInput,
  VerifyTransferResult,
} from '@/payment-providers/payment-provider.types';

function providerErrorFields(raw: unknown): {
  code?: string;
  httpStatus?: number;
  message?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const record = raw as Record<string, unknown>;
  return {
    code:
      typeof record.code === 'string'
        ? record.code
        : typeof record.type === 'string'
          ? record.type
          : undefined,
    httpStatus:
      typeof record.httpStatus === 'number' ? record.httpStatus : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
  };
}

@Injectable()
export class PaystackAdapter implements IPaymentProviderAdapter {
  readonly provider = PaymentProvider.PAYSTACK;
  private readonly logger = new Logger(PaystackAdapter.name);

  private readonly paystack = new PaystackServices();

  async ping(): Promise<boolean> {
    return this.paystack.ping(appConfig.paymentProviderHealth.timeoutMs);
  }

  async listBanks(): Promise<ListBanksResult> {
    const response = await this.paystack.getBank();
    return response;
  }

  async validateAccount(
    input: ValidateAccountInput,
  ): Promise<ValidateAccountResult> {
    const response = await this.paystack.validateAccountNumber({
      accountNumber: input.accountNumber,
      bankCode: input.bankCode,
    });

    return response;
  }

  async initiateTransfer(
    input: InitiateTransferInput,
  ): Promise<InitiateTransferResult> {
    try {
      const createTransferRecipient =
        await this.paystack.createTransferRecipient({
          type: 'nuban',
          name: input.recipientName ?? 'Transfer Recipient',
          account_number: input.accountNumber,
          bank_code: input.bankCode,
          currency: 'NGN',
        });

      if (!createTransferRecipient.status) {
        return this.failedSubmit(
          input.reference,
          'CREATE_RECIPIENT',
          createTransferRecipient,
        );
      }

      const initiateTransfer = await this.paystack.initiateTransfer({
        source: 'balance',
        amount: Number(input.amount),
        reference: input.reference,
        recipient: createTransferRecipient.data.recipient_code,
        reason: input.narration ?? 'Bank transfer',
      });

      if (!initiateTransfer.status) {
        return this.failedSubmit(
          input.reference,
          'INITIATE_TRANSFER',
          initiateTransfer,
        );
      }

      return {
        outcome: 'ACCEPTED',
        reference: input.reference,
        externalReference: initiateTransfer.data.reference,
        message: initiateTransfer.message,
        step: 'INITIATE_TRANSFER',
        raw: initiateTransfer,
      };
    } catch (error) {
      const fields = providerErrorFields(error);
      this.logger.error('Paystack transfer submit threw', {
        reference: input.reference,
        message: error instanceof Error ? error.message : String(error),
        code: fields.code,
        httpStatus: fields.httpStatus,
      });
      return {
        outcome: 'UNKNOWN',
        reference: input.reference,
        message: error instanceof Error ? error.message : String(error),
        code: fields.code,
        httpStatus: fields.httpStatus,
        step: 'INITIATE_TRANSFER',
        raw: error,
      };
    }
  }

  async verifyTransfer(
    input: VerifyTransferInput,
  ): Promise<VerifyTransferResult> {
    try {
      const response = await this.paystack.verifyTransfer({
        reference: input.reference,
      });

      if (!response?.status) {
        // "Not found" after a timeout may be provider eventual consistency,
        // not an authoritative rejection. Keep funds held and verify again.
        const fields = providerErrorFields(response);
        this.logger.warn('Paystack verify inconclusive', {
          reference: input.reference,
          outcome: 'UNKNOWN',
          message: response?.message ?? fields.message,
          code: fields.code,
          httpStatus: fields.httpStatus,
        });
        return {
          outcome: 'UNKNOWN',
          message: response?.message ?? fields.message,
          code: fields.code,
          httpStatus: fields.httpStatus,
          raw: response,
        };
      }

      const status = String(response.data?.status ?? '').toLowerCase();
      const externalReference =
        response.data?.transfer_code ??
        response.data?.reference ??
        input.reference;
      const amount =
        response.data?.amount !== undefined && response.data?.amount !== null
          ? String(response.data.amount)
          : undefined;
      const currency =
        typeof response.data?.currency === 'string'
          ? response.data.currency
          : undefined;

      if (status === 'success' || status === 'successful') {
        return {
          outcome: 'SUCCESS',
          externalReference,
          status: response.data?.status,
          amount,
          currency,
          raw: response,
        };
      }

      if (status === 'pending' || status === 'otp' || status === 'received') {
        return {
          outcome: 'ACCEPTED',
          externalReference,
          status: response.data?.status,
          amount,
          currency,
          raw: response,
        };
      }

      if (
        status === 'failed' ||
        status === 'reversed' ||
        status === 'rejected'
      ) {
        const fields = providerErrorFields(response);
        this.logger.error('Paystack verify rejected transfer', {
          reference: input.reference,
          outcome: 'REJECTED',
          status: response.data?.status,
          message: response.message ?? fields.message,
          code: fields.code,
          httpStatus: fields.httpStatus,
        });
        return {
          outcome: 'REJECTED',
          status: response.data?.status,
          message: response.message ?? fields.message,
          code: fields.code,
          httpStatus: fields.httpStatus,
          raw: response,
        };
      }

      const fields = providerErrorFields(response);
      this.logger.warn('Paystack verify still unknown', {
        reference: input.reference,
        outcome: 'UNKNOWN',
        status: response.data?.status,
        message: response.message ?? fields.message,
        code: fields.code,
        httpStatus: fields.httpStatus,
      });
      return {
        outcome: 'UNKNOWN',
        status: response.data?.status,
        message: response.message ?? fields.message,
        code: fields.code,
        httpStatus: fields.httpStatus,
        raw: response,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Paystack verify threw', {
        reference: input.reference,
        outcome: 'UNKNOWN',
        message,
      });
      return {
        outcome: 'UNKNOWN',
        message,
      };
    }
  }

  private failedSubmit(
    reference: string,
    step: ProviderSubmitStep,
    raw: unknown,
  ): InitiateTransferResult {
    const fields = providerErrorFields(raw);
    this.logger.error('Paystack transfer submit failed', {
      step,
      reference,
      message: fields.message,
      code: fields.code,
      httpStatus: fields.httpStatus,
    });

    const outcome =
      step === 'CREATE_RECIPIENT'
        ? 'REJECTED'
        : this.classifyInitiateFailure(fields);

    return {
      outcome,
      reference,
      message: fields.message,
      code: fields.code,
      httpStatus: fields.httpStatus,
      step,
      raw,
    };
  }

  private classifyInitiateFailure(fields: {
    code?: string;
    httpStatus?: number;
    message?: string;
  }): 'REJECTED' | 'UNKNOWN' {
    const httpStatus = fields.httpStatus ?? 0;
    const code = (fields.code ?? '').toLowerCase();
    const message = (fields.message ?? '').toLowerCase();
    if (httpStatus >= 500 || httpStatus === 0) {
      return 'UNKNOWN';
    }
    if (
      code.includes('timeout') ||
      code.includes('econn') ||
      message.includes('timeout') ||
      message.includes('duplicate')
    ) {
      return 'UNKNOWN';
    }
    return 'REJECTED';
  }
}
