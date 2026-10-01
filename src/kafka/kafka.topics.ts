export enum TransferTopic {
  JOBS = 'transfer.jobs',
  REVERSE = 'transfer.reverse',
}

export enum WebhookTopic {
  JOBS = 'webhook.jobs',
  DLQ = 'webhook.jobs.dlq',
}

export const KafkaTopics = {
  transfer: TransferTopic,
  webhook: WebhookTopic,
} as const;

export type KafkaTopic = TransferTopic | WebhookTopic;
