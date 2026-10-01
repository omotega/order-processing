export interface KafkaMessage {
  key?: string;
  value: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface KafkaProducerOptions {
  idempotent?: boolean;
  maxRetryTime?: number;
}

export interface KafkaConsumerOptions {
  sessionTimeout?: number;
  heartbeatInterval?: number;
  maxWaitTimeInMs?: number;
  minBytes?: number;
  maxBytes?: number;
  fromBeginning?: boolean;
}
