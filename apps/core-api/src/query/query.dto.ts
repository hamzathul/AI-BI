import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { MAX_SQL_LENGTH } from './sql-guard.js';

export class QueryRequestDto {
  @ApiProperty({
    example: 'SELECT count(*)::int AS count FROM hr.employees',
    description:
      'One guarded, read-only SQL statement. Temporary Phase 2 surface; Phase 4 replaces it with QuerySpec.',
  })
  sql: string;
}

export const queryRequestSchema: z.ZodType<QueryRequestDto> = z.object({
  sql: z
    .string()
    .min(1, 'sql is required')
    .max(MAX_SQL_LENGTH, `sql must be at most ${MAX_SQL_LENGTH} characters`),
});

export class QueryResultColumnDto {
  @ApiProperty({ example: 'count' })
  name: string;

  @ApiProperty({ example: 'integer' })
  dataType: string;
}

export class QueryResultDto {
  @ApiProperty({ type: [QueryResultColumnDto] })
  columns: QueryResultColumnDto[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Row objects keyed by column name',
  })
  rows: Record<string, unknown>[];

  @ApiProperty({ example: 1 })
  rowCount: number;

  @ApiProperty({
    example: false,
    description: 'True when the source had more than 10,000 rows',
  })
  truncated: boolean;

  @ApiProperty({ example: 12 })
  durationMs: number;
}
