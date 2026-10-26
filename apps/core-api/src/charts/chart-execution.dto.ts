import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  QueryExecutionResultDto,
  QuerySpecDto,
} from '../query/query.dto.js';
import { DashboardFiltersDto } from '../dashboards/dashboard-filters.dto.js';
import {
  CHART_SPEC_PROPERTY,
  type ChartSpecDto,
} from './charts.dto.js';

export class ChartExecutionRequestItemDto {
  @ApiProperty({
    example: '0b7a7a7e-4f5a-4a1a-9d0e-2f0c9b7d1a11',
    description:
      'Widget id from the canvas. Echoed so results can be matched to widgets.',
  })
  id: string;

  @ApiProperty(CHART_SPEC_PROPERTY)
  chart: ChartSpecDto;
}

export class ChartExecutionRequestDto {
  @ApiPropertyOptional({
    type: () => DashboardFiltersDto,
    description:
      'Dashboard-level filters. The server rewrites each chart query before executing it.',
  })
  filters?: DashboardFiltersDto;

  @ApiProperty({ type: () => [ChartExecutionRequestItemDto] })
  charts: ChartExecutionRequestItemDto[];
}

export class ChartExecutionErrorDto {
  @ApiProperty({ example: 'Unknown metric "profit".' })
  message: string;

  @ApiPropertyOptional({ example: 'TIMEOUT' })
  code?: string;
}

export class ChartExecutionResultItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: true })
  ok: boolean;

  @ApiProperty({
    example: true,
    description: 'True when at least one dashboard filter applies to this chart.',
  })
  filterApplied: boolean;

  @ApiProperty({
    type: [String],
    example: ['Filter "department" does not reach this chart, so it was not applied.'],
  })
  warnings: string[];

  @ApiPropertyOptional({
    type: () => QuerySpecDto,
    description: 'The effective query, with dashboard filters merged in.',
  })
  query?: QuerySpecDto;

  @ApiPropertyOptional({ type: () => QueryExecutionResultDto })
  result?: QueryExecutionResultDto;

  @ApiPropertyOptional({ type: () => ChartExecutionErrorDto })
  error?: ChartExecutionErrorDto;
}

export class ChartExecutionResponseDto {
  @ApiProperty({ type: () => [ChartExecutionResultItemDto] })
  results: ChartExecutionResultItemDto[];

  @ApiProperty({ type: [String] })
  warnings: string[];
}
