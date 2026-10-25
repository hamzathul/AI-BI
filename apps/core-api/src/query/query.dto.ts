import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FILTER_OPERATORS } from '../semantic/semantic-filter.js';
import { DEFAULT_QUERY_LIMIT, QUERY_MAX_ROWS } from './query.constants.js';
import { TIME_GRAINS } from './query-spec.schema.js';

export class QueryFilterDto {
  @ApiProperty({ example: 'order_status' })
  dimension: string;

  @ApiProperty({ enum: FILTER_OPERATORS, example: 'neq' })
  operator: string;

  @ApiPropertyOptional({
    description:
      'Bound filter value. Omit for is_null and is_not_null. Arrays are used by in, not_in, and between.',
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: { type: 'string' } },
    ],
  })
  value?: string | number | boolean | Array<string | number | boolean>;
}

export class QueryTimeGrainDto {
  @ApiProperty({ example: 'order_date' })
  dimension: string;

  @ApiProperty({ enum: TIME_GRAINS, example: 'month' })
  grain: string;
}

export class QueryOrderByDto {
  @ApiProperty({ example: 'revenue' })
  field: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], example: 'desc' })
  direction?: string;
}

export class QuerySpecDto {
  @ApiPropertyOptional({
    example: 'order_items',
    description:
      'Optional. The metric dataset is used when omitted; when provided it must match.',
  })
  dataset?: string;

  @ApiProperty({ type: [String], example: ['revenue'] })
  metrics: string[];

  @ApiPropertyOptional({ type: [String], example: ['product_category'] })
  dimensions?: string[];

  @ApiPropertyOptional({ type: () => QueryTimeGrainDto })
  timeGrain?: QueryTimeGrainDto;

  @ApiPropertyOptional({ type: () => [QueryFilterDto] })
  filters?: QueryFilterDto[];

  @ApiPropertyOptional({ type: () => [QueryOrderByDto] })
  orderBy?: QueryOrderByDto[];

  @ApiPropertyOptional({
    example: DEFAULT_QUERY_LIMIT,
    maximum: QUERY_MAX_ROWS,
    minimum: 1,
  })
  limit?: number;
}

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

export class QueryExecutionMetaDto {
  @ApiProperty({ example: '0b7a7a7e-...' })
  modelId: string;

  @ApiProperty({ example: 'Acme Inc.' })
  modelName: string;

  @ApiProperty({ example: 'order_items' })
  dataset: string;

  @ApiProperty({ example: 1000 })
  limit: number;

  @ApiProperty({
    example:
      'SELECT sum(t0."quantity" * t0."unit_price") FILTER (WHERE t1."status" <> $1::text) AS "revenue" FROM ...',
    description: 'The guarded SQL that was executed, with $n placeholders.',
  })
  compiledSql: string;
}

export class QueryExecutionResultDto extends QueryResultDto {
  @ApiProperty({ type: () => QueryExecutionMetaDto })
  meta: QueryExecutionMetaDto;
}
