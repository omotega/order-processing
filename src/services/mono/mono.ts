import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { appConfig } from 'src/config/config';
import { z } from 'zod';
import {
  initiateBvnLookupSchema,
  InitiateBvnLookupType,
  lookupNinSchema,
  LookupNinType,
  MonoNinJobResponse,
  MonoNinLookupResponse,
  monoInitiateResponseSchema,
  monoVerifyResponseSchema,
  pollNinJobSchema,
  verifyBvnOtpSchema,
  VerifyBvnOtpType,
} from '@/services/mono/schema';
import { MonoApiError } from '@/services/mono/mono.errors';

const MONO_TIMEOUT_MS = 15000;

@Injectable()
class MonoServices {
  private readonly logger = new Logger(MonoServices.name);
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
  }): Promise<unknown> {
    try {
      const response = await axios({
        method,
        url,
        data: body,
        timeout: MONO_TIMEOUT_MS,
        headers: {
          'mono-sec-key': this.secretKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
          ...headers,
        },
      });
      return response.data;
    } catch (error: any) {
      const status = error.response?.status;
      this.logger.error(
        `Mono api request failed status=${status ?? 'unknown'}`,
      );
      throw new MonoApiError(
        error.response?.data?.message ?? error.message ?? 'Mono request failed',
        status,
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
    const raw = await this._request({
      url,
      method: 'post',
      body: {
        bvn: payload.bvn,
        scope: payload.scope ?? 'identity',
      },
    });
    return monoInitiateResponseSchema.parse(raw);
  }

  async verifyBvnOtp(sessionId: string, payload: VerifyBvnOtpType) {
    this._runValidator(verifyBvnOtpSchema, payload);
    const url = `${this.baseUrl}/v2/lookup/bvn/verify`;
    const raw = await this._request({
      url,
      method: 'post',
      body: { otp: payload.otp },
      headers: { 'x-session-id': sessionId },
    });
    return monoVerifyResponseSchema.parse(raw);
  }

  async lookupNin(payload: LookupNinType): Promise<MonoNinLookupResponse> {
    this._runValidator(lookupNinSchema, payload);
    const query = payload.output === 'pdf' ? '?output=pdf' : '';
    const url = `${this.baseUrl}/v3/lookup/nin${query}`;
    const body: Record<string, unknown> = { nin: payload.nin };
    if (payload.dateOfBirth) {
      body.date_of_birth = payload.dateOfBirth;
    }
    return this._request({ url, method: 'post', body }) as Promise<MonoNinLookupResponse>;
  }

  async pollNinJob(jobId: string): Promise<MonoNinJobResponse> {
    this._runValidator(pollNinJobSchema, { jobId });
    const url = `${this.baseUrl}/v3/lookup/nin/${encodeURIComponent(jobId)}/job`;
    return this._request({ url, method: 'get' }) as Promise<MonoNinJobResponse>;
  }
}

export default MonoServices;
