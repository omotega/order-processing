import { z } from 'zod';

const passwordSchema = z.string().min(12).max(128);

export const userValidation = {
  register: {
    body: z
      .object({
        email: z
          .string()
          .email()
          .transform((v) => v.toLowerCase()),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
  verifyEmail: {
    body: z
      .object({
        email: z
          .string()
          .email()
          .transform((v) => v.toLowerCase()),
        otp: z.string().min(4).max(8),
        password: passwordSchema,
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
  login: {
    body: z.object({
      email: z
        .string()
        .email()
        .transform((v) => v.toLowerCase()),
      password: z.string().min(1),
    }),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
  refresh: {
    body: z
      .object({
        refreshToken: z.string().min(1),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
  recoverAccount: {
    body: z
      .object({
        email: z
          .string()
          .email()
          .transform((v) => v.toLowerCase()),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
  passwordResetStart: {
    body: z
      .object({
        email: z
          .string()
          .email()
          .transform((v) => v.toLowerCase()),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
  passwordResetConfirm: {
    body: z
      .object({
        email: z
          .string()
          .email()
          .transform((v) => v.toLowerCase()),
        otp: z.string().min(4).max(8),
        password: passwordSchema,
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
  setTransactionPin: {
    body: z
      .object({
        password: z.string().min(1),
        pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
};

export type RegisterDto = {
  body: z.infer<typeof userValidation.register.body>;
};

export type VerifyEmailDto = {
  body: z.infer<typeof userValidation.verifyEmail.body>;
};

export type LoginDto = {
  body: z.infer<typeof userValidation.login.body>;
};

export type RefreshDto = {
  body: z.infer<typeof userValidation.refresh.body>;
};

export type RecoverAccountDto = {
  body: z.infer<typeof userValidation.recoverAccount.body>;
};

export type PasswordResetStartDto = {
  body: z.infer<typeof userValidation.passwordResetStart.body>;
};

export type PasswordResetConfirmDto = {
  body: z.infer<typeof userValidation.passwordResetConfirm.body>;
};

export type SetTransactionPinDto = {
  body: z.infer<typeof userValidation.setTransactionPin.body>;
};

export default userValidation;
