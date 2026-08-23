import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { z, type ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'body' && metadata.type !== 'custom') {
      return value;
    }

    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fieldErrors =
        typeof (result.error as any).flatten === 'function'
          ? (result.error as any).flatten().fieldErrors
          : (z as any).flattenError
            ? (z as any).flattenError(result.error).fieldErrors
            : result.error;

      throw new BadRequestException({
        message: 'Validation failed',
        errors: fieldErrors,
        details: fieldErrors,
      });
    }
    return result.data;
  }
}