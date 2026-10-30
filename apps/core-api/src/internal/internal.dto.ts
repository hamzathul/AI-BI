import type { JoinType } from '../query/join-path.js';
import type { TimeGrain } from '../query/query-spec.schema.js';
import type {
  FilterOperator,
  FilterValue,
} from '../semantic/semantic-filter.js';
import type { Aggregation } from '../semantic/semantic-model.schema.js';
import type { TypeFamily } from '../semantic/type-family.js';

/**
 * The context contract between core-api and ai-service (D60).
 *
 * Deliberately narrow: only what a QuerySpec can address — metrics,
 * dimensions, joins, and the compiler's limits. Physical source columns and
 * sample rows are not part of it, because a spec cannot name them.
 */
export interface InternalContextDto {
  model: {
    id?: string;
    name: string;
    description?: string;
  };
  datasets: InternalDatasetDto[];
  joins: InternalJoinDto[];
  capabilities: InternalCapabilitiesDto;
}

export interface InternalDatasetDto {
  name: string;
  source: { schema: string; object: string };
  description?: string;
  dimensions: InternalDimensionDto[];
  metrics: InternalMetricDto[];
}

export interface InternalDimensionDto {
  name: string;
  column: string;
  dataType: string;
  family: TypeFamily;
  description?: string;
}

export interface InternalMetricDto {
  name: string;
  agg: Aggregation;
  /** Raw arithmetic text, or null for a plain count. */
  expression: string | null;
  description?: string;
  filters: InternalMetricFilterDto[];
}

export interface InternalMetricFilterDto {
  dimension: string;
  operator: FilterOperator;
  value?: FilterValue;
}

export interface InternalJoinDto {
  name: string;
  from: { dataset: string; column: string };
  to: { dataset: string; column: string };
  type: JoinType;
}

export interface InternalCapabilitiesDto {
  timeGrains: readonly TimeGrain[];
  filterOperators: readonly FilterOperator[];
  maxMetrics: number;
  maxDimensions: number;
  maxFilters: number;
  maxOrderBy: number;
  maxRows: number;
  defaultLimit: number;
}
