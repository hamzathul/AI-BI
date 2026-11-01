import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * The chat request contract (6.4). One message per request: a run is a single
 * question, not a conversation (history is deliberately out of scope).
 *
 * `trim` happens before `min`, so whitespace-only input is a 400, and the
 * stored message never starts or ends with padding.
 */
export const chatRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'message must not be empty')
    .max(2000, 'message must be at most 2000 characters'),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/**
 * Swagger-only mirror of the Zod schema. Two declarations because Zod cannot
 * carry OpenAPI metadata here; the pipe above stays authoritative.
 */
export class ChatRequestDto {
  @ApiProperty({
    example: 'Headcount by department?',
    description: 'One question about the connected data model.',
    maxLength: 2000,
  })
  message: string;
}
