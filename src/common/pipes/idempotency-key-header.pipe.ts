import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;
const SAFE_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

@Injectable()
export class IdempotencyKeyHeaderPipe
  implements PipeTransform<string | string[] | undefined, string>
{
  transform(value: string | string[] | undefined): string {
    const raw = Array.isArray(value) ? value[0] : value;

    if (raw === undefined || raw === null) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const key = raw.trim();
    if (key.length === 0) {
      throw new BadRequestException('Idempotency-Key header must not be empty');
    }

    if (key.length < MIN_LENGTH || key.length > MAX_LENGTH) {
      throw new BadRequestException(
        `Idempotency-Key must be between ${MIN_LENGTH} and ${MAX_LENGTH} characters`,
      );
    }

    if (!SAFE_KEY_PATTERN.test(key)) {
      throw new BadRequestException(
        'Idempotency-Key contains invalid characters',
      );
    }

    return key;
  }
}
