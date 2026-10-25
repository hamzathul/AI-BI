import type { QuerySpec, TimeGrain } from './query-spec.schema.js';
import { DEFAULT_QUERY_LIMIT } from './query.constants.js';
import { planJoins } from './join-path.js';
import { QueryParameters } from './parameters.js';
import { quoteIdent } from './sql-ident.js';
import { renderMetricExpression } from '../semantic/metric-expression.js';
import {
  compileFilter,
  SemanticFilterError,
  validateSemanticFilter,
  type ValidatedFilter,
} from '../semantic/semantic-filter.js';
import type {
  CatalogDataset,
  CatalogDimension,
  CatalogMetric,
  SemanticCatalog,
} from '../semantic/semantic-catalog.js';

export class QueryCompilationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join('\n'));
    this.name = 'QueryCompilationError';
  }
}

export interface CompiledQuery {
  sql: string;
  parameters: unknown[];
  dataset: string;
  limit: number;
}

interface SelectField {
  sql: string;
  name: string;
  /** The expression used in GROUP BY, when this field is non-aggregate. */
  groupSql?: string;
}

function available(names: Iterable<string>): string {
  return [...names].sort().join(', ');
}

function assertAlias(aliases: Map<string, string>, dataset: string): string {
  const alias = aliases.get(dataset);
  if (!alias) {
    throw new Error(
      `Internal compiler error: no alias for dataset "${dataset}".`,
    );
  }
  return alias;
}

function aggregateSql(metric: CatalogMetric, baseAlias: string): string {
  const expression = metric.expression
    ? renderMetricExpression(metric.expression, baseAlias)
    : '*';

  if (metric.aggregation === 'count_distinct') {
    return `count(DISTINCT ${expression})`;
  }

  return `${metric.aggregation}(${expression})`;
}

/**
 * Compiles a validated QuerySpec into one parameterized SELECT (D51).
 *
 * The compiler never trusts a name from the request: it resolves every metric,
 * dimension, filter, and join against the catalog first. Identifiers come from
 * metadata, values go through QueryParameters, and time grains come from a
 * closed enum.
 */
export function compileQuery(
  spec: QuerySpec,
  catalog: SemanticCatalog,
): CompiledQuery {
  const issues: string[] = [];

  const metrics: CatalogMetric[] = [];
  spec.metrics.forEach((name) => {
    const metric = catalog.metrics.get(name);
    if (!metric) {
      issues.push(
        `Unknown metric "${name}". Available metrics: ${available(catalog.metrics.keys())}.`,
      );
      return;
    }
    metrics.push(metric);
  });

  if (issues.length > 0) {
    throw new QueryCompilationError(issues);
  }

  const metricDatasets = new Set(metrics.map((metric) => metric.dataset));
  if (metricDatasets.size > 1) {
    throw new QueryCompilationError([
      `Metrics span datasets ${[...metricDatasets].sort().join(', ')}. A query can aggregate one fact dataset at a time in v0.`,
    ]);
  }

  const baseDatasetName = spec.dataset ?? metrics[0]!.dataset;
  const baseDataset = catalog.datasets.get(baseDatasetName);

  if (!baseDataset) {
    throw new QueryCompilationError([
      `Unknown dataset "${baseDatasetName}". Available datasets: ${available(catalog.datasets.keys())}.`,
    ]);
  }

  if (metrics.some((metric) => metric.dataset !== baseDatasetName)) {
    throw new QueryCompilationError([
      `The selected metrics belong to dataset "${metrics[0]!.dataset}", not "${baseDatasetName}". Omit "dataset" or select metrics from the same dataset.`,
    ]);
  }

  const dimensions: CatalogDimension[] = [];
  spec.dimensions.forEach((name) => {
    const dimension = catalog.dimensions.get(name);
    if (!dimension) {
      issues.push(
        `Unknown dimension "${name}". Available dimensions: ${available(catalog.dimensions.keys())}.`,
      );
      return;
    }
    dimensions.push(dimension);
  });

  let timeDimension: CatalogDimension | undefined;
  let grain: TimeGrain | undefined;

  if (spec.timeGrain) {
    const dimension = catalog.dimensions.get(spec.timeGrain.dimension);
    if (!dimension) {
      issues.push(`Unknown time dimension "${spec.timeGrain.dimension}".`);
    } else if (
      dimension.family !== 'date' &&
      dimension.family !== 'timestamp' &&
      dimension.family !== 'timestamptz'
    ) {
      issues.push(
        `Time grain requires a date or timestamp dimension; "${dimension.name}" is ${dimension.dataType}.`,
      );
    } else {
      timeDimension = dimension;
      grain = spec.timeGrain.grain;
    }
  }

  const filters: ValidatedFilter<CatalogDimension>[] = [];
  spec.filters.forEach((filter) => {
    const dimension = catalog.dimensions.get(filter.dimension);
    if (!dimension) {
      issues.push(`Unknown filter dimension "${filter.dimension}".`);
      return;
    }

    try {
      filters.push(validateSemanticFilter(filter, dimension));
    } catch (error) {
      issues.push(
        error instanceof SemanticFilterError
          ? error.message
          : `Filter on "${filter.dimension}" could not be validated.`,
      );
    }
  });

  if (issues.length > 0) {
    throw new QueryCompilationError(issues);
  }

  // Every dataset whose columns appear anywhere in the query must be joined.
  const reasons = new Map<string, string>([
    [baseDataset.name, 'the base dataset'],
  ]);

  const note = (dataset: string, reason: string) => {
    if (!reasons.has(dataset)) reasons.set(dataset, reason);
  };

  dimensions.forEach((dimension) =>
    note(dimension.dataset, `dimension "${dimension.name}"`),
  );
  if (timeDimension) {
    note(timeDimension.dataset, `time dimension "${timeDimension.name}"`);
  }
  filters.forEach((filter) =>
    note(filter.dimension.dataset, `filter on "${filter.dimension.name}"`),
  );
  metrics.forEach((metric) => {
    metric.filters.forEach((filter) =>
      note(
        filter.dimension.dataset,
        `metric filter on "${filter.dimension.name}"`,
      ),
    );
  });

  const plan = planJoins(catalog.joins, baseDataset.name, [...reasons.keys()]);

  if (plan.unreachable.length > 0) {
    throw new QueryCompilationError(
      plan.unreachable.map(
        (dataset) =>
          `Dataset "${dataset}" is not reachable from "${baseDataset.name}" (needed for ${reasons.get(dataset)}). Add the FK join to the semantic model.`,
      ),
    );
  }

  const aliasFor = (dataset: string) => assertAlias(plan.aliases, dataset);
  const baseAlias = aliasFor(baseDataset.name);
  const parameters = new QueryParameters();
  const selectFields: SelectField[] = [];

  dimensions.forEach((dimension) => {
    const alias = aliasFor(dimension.dataset);
    const column = `${alias}.${quoteIdent(dimension.column)}`;
    const sql =
      dimension.family === 'date' ? `to_char(${column}, 'YYYY-MM-DD')` : column;

    selectFields.push({
      sql,
      name: dimension.name,
      groupSql: column,
    });
  });

  if (timeDimension && grain) {
    const alias = aliasFor(timeDimension.dataset);
    const raw = `date_trunc('${grain}', ${alias}.${quoteIdent(timeDimension.column)})`;

    selectFields.push({
      sql: `to_char(${raw}, 'YYYY-MM-DD')`,
      name: timeDimension.name,
      groupSql: raw,
    });
  }

  metrics.forEach((metric) => {
    let sql = aggregateSql(metric, baseAlias);

    if (metric.filters.length > 0) {
      const conditions = metric.filters.map((filter) => {
        const alias = aliasFor(filter.dimension.dataset);
        return compileFilter(
          filter,
          `${alias}.${quoteIdent(filter.dimension.column)}`,
          parameters,
        );
      });
      sql = `${sql} FILTER (WHERE ${conditions.join(' AND ')})`;
    }

    selectFields.push({ sql, name: metric.name });
  });

  const outputNames = new Set(selectFields.map((field) => field.name));
  const orderBy = spec.orderBy.map((entry) => {
    if (!outputNames.has(entry.field)) {
      issues.push(
        `Order field "${entry.field}" is not in the result columns: ${[...outputNames].join(', ')}.`,
      );
    }
    return `${quoteIdent(entry.field)} ${entry.direction.toUpperCase()}`;
  });

  if (issues.length > 0) {
    throw new QueryCompilationError(issues);
  }

  const where = filters.map((filter) => {
    const alias = aliasFor(filter.dimension.dataset);
    return compileFilter(
      filter,
      `${alias}.${quoteIdent(filter.dimension.column)}`,
      parameters,
    );
  });

  const groupBy = selectFields
    .map((field) => field.groupSql)
    .filter((value): value is string => Boolean(value));

  const limit = spec.limit ?? DEFAULT_QUERY_LIMIT;

  const lines = [
    'SELECT',
    `  ${selectFields
      .map((field) => `${field.sql} AS ${quoteIdent(field.name)}`)
      .join(',\n  ')}`,
    `FROM ${quoteIdent(baseDataset.schemaName)}.${quoteIdent(baseDataset.objectName)} AS ${baseAlias}`,
    ...plan.edges.map((edge) => {
      const target = catalog.datasets.get(edge.toDataset) as
        CatalogDataset | undefined;
      if (!target) {
        throw new Error(
          `Internal compiler error: missing dataset "${edge.toDataset}".`,
        );
      }
      const fromAlias = aliasFor(edge.fromDataset);
      const toAlias = aliasFor(edge.toDataset);
      const keyword = edge.type === 'inner' ? 'INNER JOIN' : 'LEFT JOIN';
      return `${keyword} ${quoteIdent(target.schemaName)}.${quoteIdent(target.objectName)} AS ${toAlias} ON ${toAlias}.${quoteIdent(edge.toColumn)} = ${fromAlias}.${quoteIdent(edge.fromColumn)}`;
    }),
    ...(where.length > 0 ? [`WHERE ${where.join(' AND ')}`] : []),
    ...(groupBy.length > 0 ? [`GROUP BY ${groupBy.join(', ')}`] : []),
    ...(orderBy.length > 0 ? [`ORDER BY ${orderBy.join(', ')}`] : []),
    `LIMIT ${parameters.add(limit)}`,
  ];

  return {
    sql: lines.join('\n'),
    parameters: [...parameters.values],
    dataset: baseDataset.name,
    limit,
  };
}
