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
  return crypto
    .createHmac('sha256', Buffer.from(appConfig.encryption.secretKey, 'hex'))
    .update(value)
    .digest('hex');
}

export const validateInput = async (data: any) => {
  if (!data.email || !isValidEmail(data.email)) {
    throw new BadRequestException(VALIDATION_ERRORS.INVALID_EMAIL);
  }

  if (!data.phone || !isValidPhone(data.phone)) {
    throw new BadRequestException(VALIDATION_ERRORS.INVALID_PHONE);
  }
};
