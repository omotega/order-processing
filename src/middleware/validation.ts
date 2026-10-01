import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { formatErrorMessages } from '@/utils/helpers';
import {
  ZodObject,
  ZodRecord,
  ZodString,
  ZodArray,
  ZodNever,
  ZodType,
} from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(
    private schema: {
      query?: ZodObject<any> | ZodRecord<ZodString, ZodNever>;
      params?: ZodObject<any> | ZodType<any> | ZodRecord<ZodString, ZodNever>;
      body?:
        | ZodObject<any>
        | ZodArray<any>
        | ZodType<any>
        | ZodRecord<ZodString, ZodNever>;
    },
  ) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    const { type } = metadata;

    try {
      const schemaToValidate = this.schema[type];
      if (!schemaToValidate) {
        return value;
      }
      return schemaToValidate.parse(value);
    } catch (error: any) {
      const errorMessages = formatErrorMessages(error.issues);
      throw new BadRequestException({
        errors: errorMessages || error.issues,
      });
    }
  }
}
