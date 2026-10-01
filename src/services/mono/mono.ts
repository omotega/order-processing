import { Logger } from '@nestjs/common';
import axios from 'axios';
import { appConfig } from 'src/config/config';
import { z } from 'zod';
import {
  initiateBvnLookupSchema,
  InitiateBvnLookupType,
  verifyBvnOtpSchema,
  VerifyBvnOtpType,
} from '@/services/mono/schema';

class MonoServices {
  private secretKey: string;
  private baseUrl: string;

  constructor() {
    this.secretKey = appConfig.mono.secretKey;
    const base = appConfig.mono.baseUrl;
    this.baseUrl = base.startsWith('http') ? base : `https://${base}`;
  }

  private async _request({
    url,
    method,
    body,
    headers = {},
  }: {
    url: string;
    method: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  }): Promise<any> {
    try {
      const response = await axios({
        method,
        url,
        data: body,
        headers: {
          'mono-sec-key': this.secretKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
          ...headers,
        },
      });
      return response.data;
    } catch (error: any) {
      Logger.error(
        'Mono api request error',
        error.response?.data ?? error.message,
      );
      return (
        error.response?.data ?? { status: 'failed', message: error.message }
      );
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

  async initiateBvnLookup(payload: InitiateBvnLookupType) {
    this._runValidator(initiateBvnLookupSchema, payload);
    const url = `${this.baseUrl}/v2/lookup/bvn/initiate`;
    return this._request({
      url,
      method: 'post',
      body: {
        bvn: payload.bvn,
        scope: payload.scope ?? 'identity',
      },
    });
  }

  async verifyBvnOtp(sessionId: string, payload: VerifyBvnOtpType) {
    this._runValidator(verifyBvnOtpSchema, payload);
    const url = `${this.baseUrl}/v2/lookup/bvn/verify`;
    return this._request({
      url,
      method: 'post',
      body: { otp: payload.otp },
      headers: { 'x-session-id': sessionId },
    });
  }
}

export default MonoServices;
