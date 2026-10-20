import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const schema = z.object({ name: z.string().min(1, 'name is required') });
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed value for valid input', () => {
    expect(pipe.transform({ name: 'Acme', ignored: true })).toEqual({
      name: 'Acme',
    });
  });

  it('throws a 400 BadRequestException with readable issues', () => {
    let caught: unknown;
    try {
      pipe.transform({ name: '' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).message).toContain('name');
  });

  it('rejects non-object input', () => {
    expect(() => pipe.transform(null)).toThrow(BadRequestException);
  });
});
