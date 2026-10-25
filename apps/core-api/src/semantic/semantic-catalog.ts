import type { JoinEdge, JoinType } from '../query/join-path.js';
import type { MetricExpressionNode } from './metric-expression.js';
import type { ValidatedFilter } from './semantic-filter.js';
import type { Aggregation } from './semantic-model.schema.js';
import type { TypeFamily } from './type-family.js';

export interface CatalogColumn {
  name: string;
  dataType: string;
  family: TypeFamily;
}

export interface CatalogDimension {
  name: string;
  dataset: string;
  column: string;
  dataType: string;
  family: TypeFamily;
}

export type CatalogMetricFilter = ValidatedFilter<CatalogDimension>;

export interface CatalogMetric {
  name: string;
  dataset: string;
  aggregation: Aggregation;
  expression: MetricExpressionNode | null;
  filters: CatalogMetricFilter[];
}

export interface CatalogDataset {
  name: string;
  schemaName: string;
  objectName: string;
  columns: Map<string, CatalogColumn>;
  dimensions: Map<string, CatalogDimension>;
  metrics: Map<string, CatalogMetric>;
}

export type CatalogJoin = JoinEdge & { type: JoinType };

/**
 * Validated, metadata-resolved semantic model.
 *
 * The compiler works only with this object: every name is resolved to a
 * metadata object/column, every metric expression is parsed, and every filter
 * has a known type family. That keeps generated SQL free of user text.
 */
export interface SemanticCatalog {
  model: {
    id?: string;
    name: string;
    description?: string;
  };
  datasets: Map<string, CatalogDataset>;
  dimensions: Map<string, CatalogDimension>;
  metrics: Map<string, CatalogMetric>;
  joins: CatalogJoin[];
}
