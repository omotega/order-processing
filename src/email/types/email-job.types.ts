export type EmailTemplateName = 'registration-otp';

export type EmailJobPayload = {
  template: EmailTemplateName;
  to: string;
  subject: string;
  variables: Record<string, string>;
};
