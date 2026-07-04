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
} from './schema';

class PaystackServices {
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
    } catch (error: any) {
      Logger.error(`Paystack api request error`, error.response.data);
      return error.response.data;
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
