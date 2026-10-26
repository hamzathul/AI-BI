import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  getSchemaPath,
  type ApiPropertyOptions,
} from '@nestjs/swagger';
import { QuerySpecDto } from '../query/query.dto.js';
import {
  CHART_TYPES,
  DATE_STYLES,
  NUMBER_STYLES,
} from './chart-spec.schema.js';

export class ChartNumberFormatDto {
  @ApiProperty({ enum: NUMBER_STYLES, example: 'plain' })
  style: string;

  @ApiPropertyOptional({
    example: 'USD',
    description: 'ISO 4217 code. Only valid with the currency style.',
  })
  currency?: string;

  @ApiPropertyOptional({ example: 2, minimum: 0, maximum: 4 })
  decimals?: number;
}

export class ChartDateFormatDto {
  @ApiProperty({ enum: DATE_STYLES, example: 'month' })
  style: string;
}

export class ChartFormatDto {
  @ApiPropertyOptional({ type: () => ChartNumberFormatDto })
  number?: ChartNumberFormatDto;

  @ApiPropertyOptional({ type: () => ChartDateFormatDto })
  date?: ChartDateFormatDto;
}

export class ChartBaseDto {
  @ApiProperty({
    enum: [1],
    example: 1,
    description: 'Spec version. Bumped only when persisted charts change shape.',
  })
  v: number;

  @ApiProperty({ example: 'Revenue by category' })
  title: string;

  @ApiProperty({
    type: () => QuerySpecDto,
    description: 'The query that feeds this chart.',
  })
  query: QuerySpecDto;

  @ApiPropertyOptional({ type: () => ChartFormatDto })
  format?: ChartFormatDto;
}

export class TableChartDto extends ChartBaseDto {
  @ApiProperty({ enum: ['table'], example: 'table' })
  type: 'table';

  @ApiProperty({
    type: [String],
    example: ['product_category', 'revenue'],
    description: 'Result columns to show, in order.',
  })
  columns: string[];
}

export class KpiChartDto extends ChartBaseDto {
  @ApiProperty({ enum: ['kpi'], example: 'kpi' })
  type: 'kpi';

  @ApiProperty({
    example: 'headcount',
    description: 'Metric column whose first row is the number.',
  })
  value: string;
}

export class BarChartDto extends ChartBaseDto {
  @ApiProperty({ enum: ['bar'], example: 'bar' })
  type: 'bar';

  @ApiProperty({ example: 'product_category' })
  x: string;

  @ApiProperty({ example: 'revenue' })
  y: string;

  @ApiPropertyOptional({
    example: 'order_status',
    description: 'Optional dimension that splits the bars into series.',
  })
  series?: string;

  @ApiPropertyOptional({ example: false })
  stacked?: boolean;
}

export class LineChartDto extends ChartBaseDto {
  @ApiProperty({ enum: ['line'], example: 'line' })
  type: 'line';

  @ApiProperty({ example: 'order_date' })
  x: string;

  @ApiProperty({ example: 'revenue' })
  y: string;

  @ApiPropertyOptional({ example: 'department' })
  series?: string;

  @ApiPropertyOptional({ example: true })
  smooth?: boolean;

  @ApiPropertyOptional({ example: false })
  area?: boolean;
}

export const CHART_SPEC_MODELS = [
  TableChartDto,
  KpiChartDto,
  BarChartDto,
  LineChartDto,
] as const;

/**
 * A discriminated union at the OpenAPI level, so the generated web client gets
 * a real `table | kpi | bar | line` union instead of a loose object (D22).
 */
export const CHART_SPEC_PROPERTY = {
  description:
    'Renderer-agnostic chart definition (chart types: ' +
    CHART_TYPES.join(', ') +
    '). Encodings point at result columns; no renderer options are stored.',
  oneOf: CHART_SPEC_MODELS.map((model) => ({ $ref: getSchemaPath(model) })),
} as unknown as ApiPropertyOptions;

export type ChartSpecDto =
  | TableChartDto
  | KpiChartDto
  | BarChartDto
  | LineChartDto;
