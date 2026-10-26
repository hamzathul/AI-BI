import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardDateRangeDto {
  @ApiProperty({
    example: 'order_date',
    description: 'A date or timestamp dimension from the semantic model.',
  })
  dimension: string;

  @ApiPropertyOptional({ example: '2025-01-01' })
  from?: string;

  @ApiPropertyOptional({ example: '2025-12-31' })
  to?: string;
}

export class DashboardCategoricalFilterDto {
  @ApiProperty({ example: 'department' })
  dimension: string;

  @ApiProperty({
    oneOf: [
      { type: 'string' },
      { type: 'array', items: { type: 'string' } },
    ],
    example: 'Engineering',
    description: 'A string becomes an eq filter; an array becomes an in filter.',
  })
  value: string | string[];
}

export class DashboardFiltersDto {
  @ApiPropertyOptional({ type: () => DashboardDateRangeDto })
  dateRange?: DashboardDateRangeDto;

  @ApiPropertyOptional({ type: () => DashboardCategoricalFilterDto })
  categorical?: DashboardCategoricalFilterDto;
}
