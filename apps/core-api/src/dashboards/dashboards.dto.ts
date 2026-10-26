import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CHART_SPEC_PROPERTY,
  type ChartSpecDto,
} from '../charts/charts.dto.js';
import { DashboardFiltersDto } from './dashboard-filters.dto.js';

export class WidgetLayoutDto {
  @ApiProperty({ example: 0, minimum: 0, maximum: 11 })
  x: number;

  @ApiProperty({ example: 0, minimum: 0 })
  y: number;

  @ApiProperty({ example: 6, minimum: 2, maximum: 12 })
  w: number;

  @ApiProperty({ example: 5, minimum: 2, maximum: 20 })
  h: number;
}

export class DashboardWidgetDto {
  @ApiProperty({ example: '0b7a7a7e-4f5a-4a1a-9d0e-2f0c9b7d1a11' })
  id: string;

  @ApiProperty(CHART_SPEC_PROPERTY)
  chart: ChartSpecDto;

  @ApiProperty({ type: () => WidgetLayoutDto })
  layout: WidgetLayoutDto;
}

export class DashboardSummaryDto {
  @ApiProperty({ example: '0b7a7a7e-4f5a-4a1a-9d0e-2f0c9b7d1a11' })
  id: string;

  @ApiProperty({ example: 'Revenue overview' })
  name: string;

  @ApiProperty({ example: 4 })
  widgetCount: number;

  @ApiProperty({ example: 3, description: 'Optimistic-concurrency version.' })
  version: number;

  @ApiProperty({ example: '2026-10-26T10:00:00.000Z' })
  updatedAt: string;
}

export class DashboardListDto {
  @ApiProperty({ type: () => [DashboardSummaryDto] })
  dashboards: DashboardSummaryDto[];
}

export class DashboardDto {
  @ApiProperty({ example: '0b7a7a7e-4f5a-4a1a-9d0e-2f0c9b7d1a11' })
  id: string;

  @ApiProperty({ example: 'Revenue overview' })
  name: string;

  @ApiProperty({ example: 3 })
  version: number;

  @ApiProperty({
    type: () => DashboardFiltersDto,
    description: 'Empty object when the dashboard has no global filters.',
  })
  filters: DashboardFiltersDto;

  @ApiProperty({ type: () => [DashboardWidgetDto] })
  widgets: DashboardWidgetDto[];

  @ApiProperty({ example: '2026-10-26T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-10-26T10:00:00.000Z' })
  updatedAt: string;
}

export class CreateDashboardDto {
  @ApiProperty({ example: 'Revenue overview' })
  name: string;
}

/**
 * Whole-document write (D56). The expected version makes a stale save a 409
 * instead of a silent overwrite.
 */
export class DashboardWriteDto {
  @ApiProperty({ example: 3, minimum: 1 })
  expectedVersion: number;

  @ApiProperty({ example: 'Revenue overview' })
  name: string;

  @ApiPropertyOptional({ type: () => DashboardFiltersDto })
  filters?: DashboardFiltersDto;

  @ApiProperty({ type: () => [DashboardWidgetDto] })
  widgets: DashboardWidgetDto[];
}
