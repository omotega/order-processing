import { v7 as uuidv7 } from 'uuid';

/**
 * Surrogate primary keys (UUIDv7). Prefer this over nanoid for table PKs.
 * Do not use crypto.randomUUID() — that is UUIDv4 (random, not time-ordered).
 */
export function newId(): string {
  return uuidv7();
}
