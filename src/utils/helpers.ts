/* eslint-disable @typescript-eslint/no-unused-vars */
import { customAlphabet } from 'nanoid';
import * as crypto from 'crypto';
import { appConfig } from '@/config/config';
import { BadRequestException } from '@nestjs/common';
import { VALIDATION_ERRORS } from '@/common/errors/index';

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^(?:(?:(?:\+|00)234)|0)?[789][01]\d{8}$/;
  return phoneRegex.test(phone);
}

const getNumbers = () => {
  return '0123456789';
};

const getLetters = () => {
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
};

// Utility function to exclude fields from objects
export function exclude<T, Key extends keyof T>(
  obj: T,
  keys: Key[],
): Omit<T, Key> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

export const generateOtpCode = (length: number) => {
  const result = getNumbers();
  const nanoid = customAlphabet(result, length);
  return nanoid();
};

export const generateLetterCode = (length: number) => {
  const result = getLetters();
  const nanoid = customAlphabet(result, length);
  return nanoid();
};

export function formatErrorMessages(errors: any) {
  return errors.reduce((acc, curr) => {
    const { path, message } = curr;
    return {
      ...acc,
      [path.join('.')]: `${[path.join('.')]} is ${message}`,
    };
  }, {});
}

// Generate a key and IV, then convert them to strings.
// const key = crypto.randomBytes(32).toString('hex'); // 64 characters in hex
// const iv = crypto.randomBytes(16).toString('hex'); // 32 characters in hex

export function encryptData(text: string): string {
  const cipher = crypto.createCipheriv(
    appConfig.encryption.encryptionMethod,
    Buffer.from(appConfig.encryption.secretKey, 'hex'),
    Buffer.from(appConfig.encryption.secretIV, 'hex'),
  );
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${appConfig.encryption.secretIV}:${encrypted}`;
}

export function decryptData(encryptedText: string): string {
  const [ivHex, encrypted] = encryptedText.split(':');

  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted data');
  }

  const decipher = crypto.createDecipheriv(
    appConfig.encryption.encryptionMethod,
    Buffer.from(appConfig.encryption.secretKey, 'hex'),
    Buffer.from(ivHex, 'hex'),
  );
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/** Keyed hash for uniqueness/dedup of sensitive identifiers (BVN, NIN, account numbers). */
export function hashSensitive(value: string): string {
  return fingerprintIdentifier(value);
}

export function hmacHex(value: string, key: string): string {
  return crypto.createHmac('sha256', key).update(value).digest('hex');
}

/** Digits-only HMAC with the dedicated KYC fingerprint key. */
export function fingerprintIdentifier(value: string): string {
  const digits = value.replace(/\D/g, '');
  return hmacHex(digits, appConfig.kyc.fingerprintKey);
}

export function sealData(plaintext: string): string {
  const key = Buffer.from(appConfig.kyc.dataKey, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function openData(sealed: string): string {
  const [version, ivHex, tagHex, encryptedHex] = sealed.split(':');
  if (version !== 'v1' || !ivHex || !tagHex || !encryptedHex) {
    throw new Error('Invalid sealed data');
  }
  const key = Buffer.from(appConfig.kyc.dataKey, 'hex');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export const validateInput = async (data: any) => {
  if (!data.email || !isValidEmail(data.email)) {
    throw new BadRequestException(VALIDATION_ERRORS.INVALID_EMAIL);
  }

  if (!data.phone || !isValidPhone(data.phone)) {
    throw new BadRequestException(VALIDATION_ERRORS.INVALID_PHONE);
  }
};
