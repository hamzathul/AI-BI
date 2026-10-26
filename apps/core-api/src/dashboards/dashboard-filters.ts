import { findJoinPath } from '../query/join-path.js';
import type { QuerySpec } from '../query/query-spec.schema.js';
import type { SemanticCatalog } from '../semantic/semantic-catalog.js';
import type { SemanticFilter } from '../semantic/semantic-filter.js';
import { typeFamily, type TypeFamily } from '../semantic/type-family.js';
import type { DashboardFilters } from './dashboard-filters.schema.js';

export class DashboardFilterError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join('\n'));
    this.name = 'DashboardFilterError';
  }
}

const DATE_FAMILIES = new Set<TypeFamily>([
  'date',
  'timestamp',
  'timestamptz',
]);

/**
 * Checks a dashboard filter against the saved semantic model.
 *
 * Used when a dashboard is saved: a filter that names a missing dimension, or a
 * date range on a text column, is a configuration error the author can fix.
 */
export function validateDashboardFilters(
  filters: DashboardFilters,
  catalog: SemanticCatalog,
): void {
  const issues: string[] = [];

  if (filters.dateRange) {
    const { dimension } = filters.dateRange;
    const resolved = catalog.dimensions.get(dimension);

    if (!resolved) {
      issues.push(
        `Unknown date dimension "${dimension}". Available dimensions: ${[...catalog.dimensions.keys()].sort().join(', ')}.`,
      );
    } else if (!DATE_FAMILIES.has(typeFamily(resolved.dataType))) {
      issues.push(
        `The date range needs a date or timestamp dimension; "${resolved.name}" is ${resolved.dataType}.`,
      );
    }
  }

  if (filters.categorical) {
    const { dimension } = filters.categorical;
    const resolved = catalog.dimensions.get(dimension);

    if (!resolved) {
      issues.push(
        `Unknown filter dimension "${dimension}". Available dimensions: ${[...catalog.dimensions.keys()].sort().join(', ')}.`,
      );
    } else if (typeFamily(resolved.dataType) === 'other') {
      issues.push(
        `Filter "${resolved.name}" has type "${resolved.dataType}", which has no v0 filter mapping.`,
      );
    }
  }

  if (issues.length > 0) throw new DashboardFilterError(issues);
}

export interface AppliedDashboardFilters {
  /** The widget query with dashboard filters merged in. */
  query: QuerySpec;
  /** Dimensions whose filter applies to this query. */
  applied: string[];
  /** Dimensions this query cannot reach; the caller decides how to report it. */
  skipped: string[];
}

function baseDatasetOf(query: QuerySpec, catalog: SemanticCatalog): string {
  if (query.dataset) return query.dataset;

  const firstMetric = query.metrics[0];
  const metric = firstMetric ? catalog.metrics.get(firstMetric) : undefined;

  if (!metric) {
    throw new DashboardFilterError([
      `Cannot resolve the fact dataset for metric "${firstMetric ?? ''}".`,
    ]);
  }

  return metric.dataset;
}

/**
 * Rewrites one widget query with the dashboard filters (5.7).
 *
 * The dashboard filter wins over a widget filter on the same dimension: an
 * author who narrows the whole dashboard should not be silently overridden by
 * one tile. A dimension the widget cannot join to is skipped, never guessed —
 * the caller surfaces a warning instead.
 */
export function applyDashboardFilters(
  query: QuerySpec,
  filters: DashboardFilters,
  catalog: SemanticCatalog,
): AppliedDashboardFilters {
  const baseDataset = baseDatasetOf(query, catalog);
  const applied: string[] = [];
  const skipped: string[] = [];
  const additions: SemanticFilter[] = [];

  const consider = (name: string, build: (name: string) => SemanticFilter[]) => {
    const dimension = catalog.dimensions.get(name);

    if (!dimension) {
      throw new DashboardFilterError([
        `Unknown filter dimension "${name}".`,
      ]);
    }

    const reachable =
      dimension.dataset === baseDataset ||
      findJoinPath(catalog.joins, baseDataset, dimension.dataset) !== null;

    if (!reachable) {
      skipped.push(name);
      return;
    }

    additions.push(...build(name));
    applied.push(name);
  };

  if (filters.dateRange) {
    const { dimension, from, to } = filters.dateRange;

    consider(dimension, (name) => {
      const range: SemanticFilter[] = [];

      if (from) range.push({ dimension: name, operator: 'gte', value: from });
      if (to) range.push({ dimension: name, operator: 'lte', value: to });

      return range;
    });
  }

  if (filters.categorical) {
    const { dimension, value } = filters.categorical;

    consider(dimension, (name) => [
      {
        dimension: name,
        operator: Array.isArray(value) ? 'in' : 'eq',
        value,
      },
    ]);
  }

  if (additions.length === 0) {
    return { query, applied, skipped };
  }

  const overridden = new Set(additions.map((filter) => filter.dimension));

  return {
    query: {
      ...query,
      filters: [
        ...query.filters.filter((filter) => !overridden.has(filter.dimension)),
        ...additions,
      ],
    },
    applied,
    skipped,
  };
}
