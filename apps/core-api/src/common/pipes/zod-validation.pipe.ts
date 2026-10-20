import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { z } from 'zod';

/**
 * Small reusable Zod pipe (D28: Zod is the project's validation library).
 * Reused by the QuerySpec endpoints in Phase 4.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException(z.prettifyError(result.error));
    }

    return result.data;
  }
}
