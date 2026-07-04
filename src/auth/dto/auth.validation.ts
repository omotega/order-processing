import { z } from 'zod';

export const userValidation = {
  register: {
    body: z
      .object({
        firstName: z.string(),
        lastName: z.string(),
        email: z.email(),
        phone: z.string(),
        password: z.string().length(8),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
  login: {
    body: z.object({
      email: z.string().email().optional(),
      password: z.string(),
    }),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
  validateAccount: {
    body: z
      .object({
        otp: z.string(),
        email: z.string().email(),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
  // userProfile: {
  //   params: z.object({
  //     userId: z.string(),
  //   }),
  // },
  recoverAccount: {
    body: z
      .object({
        email: z.string(),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
  resetPassword: {
    body: z
      .object({
        token: z.string(),
        encryptedData: z.string(),
        newPassword: z.string(),
      })
      .strict(),
    query: z.record(z.string(), z.never()),
    params: z.record(z.string(), z.never()),
  },
};

export type RegisterDto = {
  body: z.infer<typeof userValidation.register.body>;
  query: z.infer<typeof userValidation.register.query>;
  params: z.infer<typeof userValidation.register.params>;
};

export type RecoverAccountDto = {
  body: z.infer<typeof userValidation.recoverAccount.body>;
  query: z.infer<typeof userValidation.recoverAccount.query>;
  params: z.infer<typeof userValidation.recoverAccount.params>;
};

export type LoginDto = {
  body: z.infer<typeof userValidation.login.body>;
  query: z.infer<typeof userValidation.login.query>;
  params: z.infer<typeof userValidation.login.params>;
};

export type ValidateAccounttDto = {
  body: z.infer<typeof userValidation.validateAccount.body>;
  query: z.infer<typeof userValidation.validateAccount.query>;
  params: z.infer<typeof userValidation.validateAccount.params>;
};

// export type UserProfileDto = {
//   params: z.infer<typeof userValidation.userProfile.params>;
// };

export type ResetPasswordDto = {
  body: z.infer<typeof userValidation.resetPassword.body>;
  query: z.infer<typeof userValidation.resetPassword.query>;
  params: z.infer<typeof userValidation.resetPassword.params>;
};

export default userValidation;
