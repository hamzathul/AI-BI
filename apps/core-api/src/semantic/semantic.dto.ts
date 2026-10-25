import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FILTER_OPERATORS } from './semantic-filter.js';
import { AGGREGATIONS, JOIN_TYPES } from './semantic-model.schema.js';

export class SemanticSourceDto {
  @ApiProperty({ example: 'hr' })
  schema: string;

  @ApiProperty({ example: 'employees' })
  object: string;
}

export class SemanticDimensionDto {
  @ApiProperty({ example: 'department' })
  name: string;

  @ApiProperty({
    example: 'name',
    description: 'Column name in the source dataset.',
  })
  column: string;

  @ApiPropertyOptional({ example: 'Department name.' })
  description?: string;
}

export class SemanticMetricFilterDto {
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

export class SemanticMetricDto {
  @ApiProperty({ example: 'headcount' })
  name: string;

  @ApiProperty({ enum: AGGREGATIONS, example: 'count' })
  agg: string;

  @ApiPropertyOptional({
    example: 'id',
    description:
      'Column arithmetic over the metric dataset. Omit for count(*).',
  })
  expression?: string;

  @ApiPropertyOptional({ example: 'Active employees.' })
  description?: string;

  @ApiPropertyOptional({
    type: () => [SemanticMetricFilterDto],
    description: 'Metric-level filters compiled as FILTER (WHERE ...).',
  })
  filters?: SemanticMetricFilterDto[];
}

export class SemanticDatasetDto {
  @ApiProperty({ example: 'employees' })
  name: string;

  @ApiProperty({ type: () => SemanticSourceDto })
  source: SemanticSourceDto;

  @ApiPropertyOptional({ example: 'One row per employee.' })
  description?: string;

  @ApiPropertyOptional({ type: () => [SemanticDimensionDto] })
  dimensions?: SemanticDimensionDto[];

  @ApiPropertyOptional({ type: () => [SemanticMetricDto] })
  metrics?: SemanticMetricDto[];
}

export class SemanticJoinEndpointDto {
  @ApiProperty({ example: 'employees' })
  dataset: string;

  @ApiProperty({ example: 'department_id' })
  column: string;
}

export class SemanticJoinDto {
  @ApiProperty({ example: 'employees_department' })
  name: string;

  @ApiProperty({ type: () => SemanticJoinEndpointDto })
  from: SemanticJoinEndpointDto;

  @ApiProperty({ type: () => SemanticJoinEndpointDto })
  to: SemanticJoinEndpointDto;

  @ApiPropertyOptional({ enum: JOIN_TYPES, example: 'left' })
  type?: string;
}

export class SemanticModelDto {
  @ApiProperty({ example: 'Acme Inc.' })
  name: string;

  @ApiPropertyOptional({ example: 'HR and sales semantics.' })
  description?: string;

  @ApiProperty({ type: () => [SemanticDatasetDto] })
  datasets: SemanticDatasetDto[];

  @ApiPropertyOptional({ type: () => [SemanticJoinDto] })
  joins?: SemanticJoinDto[];
}

export class SemanticModelResponseDto {
  @ApiProperty({
    type: () => SemanticModelDto,
    nullable: true,
    description: 'The saved model, or null before the first save.',
  })
  model: SemanticModelDto | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-10-22T15:30:00.000Z',
  })
  updatedAt: string | null;
}

export class SemanticModelSummaryDto {
  @ApiProperty({ example: 6 })
  datasets: number;

  @ApiProperty({ example: 11 })
  dimensions: number;

  @ApiProperty({ example: 11 })
  metrics: number;

  @ApiProperty({ example: 4 })
  joins: number;
}

export class SemanticValidationResponseDto {
  @ApiProperty({ example: true })
  valid: boolean;

  @ApiProperty({ type: () => SemanticModelSummaryDto })
  summary: SemanticModelSummaryDto;
}

export class SemanticExampleResponseDto {
  @ApiProperty({ type: () => SemanticModelDto })
  model: SemanticModelDto;
}
