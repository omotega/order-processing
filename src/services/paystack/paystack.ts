import { Logger } from '@nestjs/common';
import axios from 'axios';
import { appConfig } from 'src/config/config';
import { z } from 'zod';
import {
  createTransferRecipientSchema,
  createTransferRecipientType,
  initiateTransferSchema,
  initiateTransferType,
  verifyTransferType,
  transferSchema,
  transferType,
  validateAccountNumberSchema,
  validateAccountNumberType,
  verifyTransferSchema,
  createTransferRecipientResponseType,
  initiateTransferResponseType,
} from '@/services/paystack/schema';

const MAX_ERROR_BODY_CHARS = 2000;

function truncateJson(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value;
  }
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= MAX_ERROR_BODY_CHARS) {
      return value;
    }
    return `${serialized.slice(0, MAX_ERROR_BODY_CHARS)}…`;
  } catch {
    return String(value).slice(0, MAX_ERROR_BODY_CHARS);
  }
}

function extractPaystackError(error: unknown): {
  httpStatus?: number;
  code?: string;
  message: string;
  body: unknown;
} {
  const axiosError = error as {
    message?: string;
    response?: { status?: number; data?: unknown };
  };
  const body = axiosError.response?.data;
  const bodyRecord =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : null;

  const code =
    (typeof bodyRecord?.code === 'string' && bodyRecord.code) ||
    (typeof bodyRecord?.type === 'string' && bodyRecord.type) ||
    undefined;
  const message =
    (typeof bodyRecord?.message === 'string' && bodyRecord.message) ||
    (typeof (bodyRecord?.error as { message?: string } | undefined)?.message ===
      'string' &&
      (bodyRecord?.error as { message?: string }).message) ||
    axiosError.message ||
    'Paystack API request failed';

  return {
    httpStatus: axiosError.response?.status,
    code,
    message,
    body,
  };
}

class PaystackServices {
  private readonly logger = new Logger(PaystackServices.name);
  private secretKey: string;
  private baseUrl: string;

  constructor() {
    this.secretKey = appConfig.paystack.secretKey;
    this.baseUrl = appConfig.paystack.baseUrl;
  }

  private async _request({
    url,
    method,
    body,
  }: {
    url: string;
    method: string;
    body?: any;
  }): Promise<any> {
    try {
      const response = await axios({
        method: method,
        url: url,
        data: body,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (error: unknown) {
      const extracted = extractPaystackError(error);
      this.logger.error('Paystack API request failed', {
        method,
        url,
        httpStatus: extracted.httpStatus,
        code: extracted.code,
        message: extracted.message,
        body: truncateJson(extracted.body),
      });
      return {
        status: false,
        message: extracted.message,
        code: extracted.code,
        httpStatus: extracted.httpStatus,
        data: extracted.body ?? null,
      };
    }
  }

  private _runValidator(
    schema: z.ZodObject<any>,
    value: { [key: string]: any },
  ) {
    try {
      schema.strict().parse(value);
    } catch (e: any) {
      const errMsgs = e.issues.map((error: any) => error.message);
      throw new Error(errMsgs.join(', '));
    }
  }

  async getBank() {
    const url = `${this.baseUrl}/bank`;
    const response = await this._request({
      url: url,
      method: 'get',
      body: {
        country: 'nigeria',
      },
    });
    return response;
  }

  async ping(timeoutMs = 5000): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/bank`, {
        params: { country: 'nigeria' },
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        timeout: timeoutMs,
      });
      return response.data?.status === true;
    } catch {
      return false;
    }
  }

  async validateAccountNumber(payload: validateAccountNumberType) {
    this._runValidator(validateAccountNumberSchema, payload);
    const url = `${this.baseUrl}/bank/resolve?account_number=${payload.accountNumber}&bank_code=${payload.bankCode}`;
    const response = await this._request({
      url: url,
      method: 'get',
    });
    return response;
  }

  async createTransferRecipient(
    payload: createTransferRecipientType,
  ): Promise<createTransferRecipientResponseType> {
    const url = `${this.baseUrl}/transferrecipient`;
    this._runValidator(createTransferRecipientSchema, payload);
    const response = await this._request({
      url: url,
      method: 'post',
      body: payload,
    });
    return response;
  }

  async initiateTransfer(
    payload: initiateTransferType,
  ): Promise<initiateTransferResponseType> {
    const url = `${this.baseUrl}/transfer`;
    this._runValidator(initiateTransferSchema, payload);

    const response = await this._request({
      url: url,
      method: 'post',
      body: payload,
    });
    return response;
  }

  async transfer(payload: transferType) {
    const url = `${this.baseUrl}/transfer/finalize_transfer`;
    this._runValidator(transferSchema, payload);

    const response = await this._request({
      url: url,
      method: 'post',
      body: payload,
    });
    return response;
  }

  async verifyTransfer(payload: verifyTransferType) {
    const url = `${this.baseUrl}/transfer/verify/${payload.reference}`;
    this._runValidator(verifyTransferSchema, payload);

    const response = await this._request({
      url: url,
      method: 'get',
    });
    return response;
  }
}

export default PaystackServices;

// accountNumber: '0011223344',
//       bankCode: '001',
