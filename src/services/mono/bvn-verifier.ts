import { Injectable } from '@nestjs/common';
import MonoServices from '@/services/mono/mono';
import type {
  InitiateBvnLookupType,
  MonoInitiateResponseType,
  MonoVerifyResponseType,
  VerifyBvnOtpType,
} from '@/services/mono/schema';

export const BVN_VERIFIER = Symbol('BVN_VERIFIER');

export interface BvnVerifier {
  initiateBvnLookup(
    payload: InitiateBvnLookupType,
  ): Promise<MonoInitiateResponseType>;
  verifyBvnOtp(
    sessionId: string,
    payload: VerifyBvnOtpType,
  ): Promise<MonoVerifyResponseType>;
}

@Injectable()
export class MonoBvnVerifier implements BvnVerifier {
  private readonly mono = new MonoServices();

  initiateBvnLookup(payload: InitiateBvnLookupType) {
    return this.mono.initiateBvnLookup(payload);
  }

  verifyBvnOtp(sessionId: string, payload: VerifyBvnOtpType) {
    return this.mono.verifyBvnOtp(sessionId, payload);
  }
}
