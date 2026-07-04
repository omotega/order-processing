export const EMAIL_QUEUE_NAME = 'email-send';

export const EMAIL_JOBS = {
  SEND: 'send-email',
} as const;

export const EMAIL_QUEUE_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};
