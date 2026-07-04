// RabbitMQ Queue Names
export const QUEUES = {
  WEBHOOK_EVENTS: 'webhook.events',
  WEBHOOK_EVENTS_DLQ: 'webhook.events.dlq',
};

// Exchange Names
export const EXCHANGES = {
  WEBHOOK: 'webhook.exchange',
  DLX: 'webhook.dlx', // Dead Letter Exchange
};

// Routing Keys
export const ROUTING_KEYS = {
  TRANSFER_SUCCESS: 'webhook.transfer.success',
  TRANSFER_FAILED: 'webhook.transfer.failed',
  TRANSFER_REVERSED: 'webhook.transfer.reversed',
  CHARGE_SUCCESS: 'webhook.charge.success',
  CHARGE_FAILED: 'webhook.charge.failed',
};

// Queue Configuration
export const QUEUE_OPTIONS = {
  durable: true, // Survive broker restart
  arguments: {
    'x-message-ttl': 86400000, // 24 hours
    'x-max-length': 10000, // Max 10k messages
    'x-overflow': 'reject-publish', // Reject when full
    'x-dead-letter-exchange': EXCHANGES.DLX,
    'x-dead-letter-routing-key': 'webhook.dlq',
  },
};

// Consumer Configuration
export const CONSUMER_OPTIONS = {
  noAck: false, // Manual acknowledgment
  prefetchCount: 10, // Process 10 messages at a time
};
