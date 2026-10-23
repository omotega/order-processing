export type EmailTemplateName = 'registration-otp' | 'account-notice';

export type EmailJobPayload = {
  template: EmailTemplateName;
  to: string;
  subject: string;
  variables: Record<string, string>;
};
