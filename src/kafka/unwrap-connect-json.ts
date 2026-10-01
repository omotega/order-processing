/**
 * Kafka Connect JsonConverter with schemas.enable=true wraps values as
 * `{ schema, payload }`. Debezium EventRouter puts the outbox JSON in payload.
 *
 * Direct Kafka publishes send domain jobs as plain JSON. Webhook jobs include a
 * top-level `payload` field, so we must not unwrap those.
 */
export function unwrapConnectJson(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.processorId === 'string' &&
    typeof record.eventId === 'string'
  ) {
    return value;
  }

  if (!('payload' in record)) {
    return value;
  }

  if ('schema' in record) {
    return unwrapPayloadField(record.payload);
  }

  const keys = Object.keys(record);
  if (keys.length === 1 && keys[0] === 'payload') {
    return unwrapPayloadField(record.payload);
  }

  return value;
}

function unwrapPayloadField(payload: unknown): unknown {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  }

  return payload;
}
