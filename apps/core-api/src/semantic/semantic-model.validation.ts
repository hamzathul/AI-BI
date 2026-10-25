import { findJoinPath, type JoinEdge } from '../query/join-path.js';
import type {
  MetadataObjectDto,
  MetadataRelationDto,
  MetadataSnapshotDto,
} from '../metadata/metadata.dto.js';
import {
  collectMetricExpressionColumns,
  MetricExpressionError,
  parseMetricExpression,
  type MetricExpressionNode,
} from './metric-expression.js';
import {
  SemanticFilterError,
  validateSemanticFilter,
  type ValidatedFilter,
} from './semantic-filter.js';
import type {
  CatalogDataset,
  CatalogDimension,
  CatalogJoin,
  CatalogMetric,
  CatalogMetricFilter,
  SemanticCatalog,
} from './semantic-catalog.js';
import type { SemanticModelDocument } from './semantic-model.schema.js';
import { typeFamily } from './type-family.js';

export class SemanticModelValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join('\n'));
    this.name = 'SemanticModelValidationError';
  }
}

interface BuildCatalogOptions {
  modelId?: string;
}

function objectKey(schema: string, object: string): string {
  return `${schema}\u0000${object}`;
}

function relationKey(
  fromSchema: string,
  fromObject: string,
  fromColumn: string,
  toSchema: string,
  toObject: string,
  toColumn: string,
): string {
  return [
    fromSchema,
    fromObject,
    fromColumn,
    toSchema,
    toObject,
    toColumn,
  ].join('\u0000');
}

function indexObjects(
  metadata: MetadataSnapshotDto,
): Map<string, MetadataObjectDto> {
  const objects = new Map<string, MetadataObjectDto>();

  for (const schema of metadata.schemas) {
    for (const object of schema.objects) {
      objects.set(objectKey(schema.name, object.name), object);
    }
  }

  return objects;
}

/**
 * Joins may only use a real, single-column FK in child -> parent direction.
 * Composite FKs are represented as several metadata relations sharing a name;
 * they need multi-column join support and are rejected in v0.
 */
function indexRelations(
  metadata: MetadataSnapshotDto,
): Map<string, { relation: MetadataRelationDto; composite: boolean }> {
  const byName = new Map<string, MetadataRelationDto[]>();

  for (const relation of metadata.relations) {
    const group = byName.get(relation.name) ?? [];
    group.push(relation);
    byName.set(relation.name, group);
  }

  const byKey = new Map<
    string,
    { relation: MetadataRelationDto; composite: boolean }
  >();

  for (const group of byName.values()) {
    for (const relation of group) {
      byKey.set(
        relationKey(
          relation.from.schema,
          relation.from.object,
          relation.from.column,
          relation.to.schema,
          relation.to.object,
          relation.to.column,
        ),
        { relation, composite: group.length > 1 },
      );
    }
  }

  return byKey;
}

/**
 * Turns an editable document plus the current metadata snapshot into a
 * compiler-ready catalog (D49/D50).
 *
 * Collects issues instead of throwing on the first one so the editor can show
 * every broken reference in one pass.
 */
export function buildSemanticCatalog(
  document: SemanticModelDocument,
  metadata: MetadataSnapshotDto,
  options: BuildCatalogOptions = {},
): SemanticCatalog {
  const issues: string[] = [];
  const objects = indexObjects(metadata);
  const relations = indexRelations(metadata);

  const catalog: SemanticCatalog = {
    model: {
      id: options.modelId,
      name: document.name,
      ...(document.description ? { description: document.description } : {}),
    },
    datasets: new Map(),
    dimensions: new Map(),
    metrics: new Map(),
    joins: [],
  };

  if (metadata.schemas.length === 0) {
    issues.push(
      'No metadata snapshot is available. Sync the source database before saving or querying a semantic model.',
    );
    throw new SemanticModelValidationError(issues);
  }

  const sourceKeys = new Map<string, string>();

  // Datasets first: everything else resolves through them.
  document.datasets.forEach((dataset) => {
    const sourceKey = objectKey(dataset.source.schema, dataset.source.object);
    const otherDataset = sourceKeys.get(sourceKey);

    if (otherDataset) {
      issues.push(
        `Dataset "${dataset.name}": source ${dataset.source.schema}.${dataset.source.object} is already exposed as dataset "${otherDataset}".`,
      );
    } else {
      sourceKeys.set(sourceKey, dataset.name);
    }

    const object = objects.get(sourceKey);
    if (!object) {
      issues.push(
        `Dataset "${dataset.name}": source ${dataset.source.schema}.${dataset.source.object} is not in the current metadata snapshot. Sync the source or fix the source name.`,
      );
      return;
    }

    const columns = new Map(
      object.columns.map((column) => [
        column.name,
        {
          name: column.name,
          dataType: column.dataType,
          family: typeFamily(column.dataType),
        },
      ]),
    );

    const catalogDataset: CatalogDataset = {
      name: dataset.name,
      schemaName: dataset.source.schema,
      objectName: dataset.source.object,
      columns,
      dimensions: new Map(),
      metrics: new Map(),
    };

    catalog.datasets.set(dataset.name, catalogDataset);
  });

  // Joins next: dimensions and metric filters need the graph.
  const joinEndpointKeys = new Set<string>();

  document.joins.forEach((join) => {
    const fromDataset = catalog.datasets.get(join.from.dataset);
    const toDataset = catalog.datasets.get(join.to.dataset);

    if (!fromDataset || !toDataset) {
      // The dataset pass already recorded an issue; avoid a noisy duplicate.
      return;
    }

    if (fromDataset.name === toDataset.name) {
      issues.push(`Join "${join.name}": self-joins are not supported in v0.`);
      return;
    }

    if (!fromDataset.columns.has(join.from.column)) {
      issues.push(
        `Join "${join.name}": column "${join.from.column}" does not exist on dataset "${fromDataset.name}" (${fromDataset.schemaName}.${fromDataset.objectName}).`,
      );
    }
    if (!toDataset.columns.has(join.to.column)) {
      issues.push(
        `Join "${join.name}": column "${join.to.column}" does not exist on dataset "${toDataset.name}" (${toDataset.schemaName}.${toDataset.objectName}).`,
      );
    }

    const key = relationKey(
      fromDataset.schemaName,
      fromDataset.objectName,
      join.from.column,
      toDataset.schemaName,
      toDataset.objectName,
      join.to.column,
    );
    const relation = relations.get(key);

    if (!relation) {
      issues.push(
        `Join "${join.name}": ${fromDataset.schemaName}.${fromDataset.objectName}.${join.from.column} -> ${toDataset.schemaName}.${toDataset.objectName}.${join.to.column} does not match a discovered foreign key. Joins must follow the FK from child to parent.`,
      );
    } else if (relation.composite) {
      issues.push(
        `Join "${join.name}": uses composite foreign key "${relation.relation.name}", which is not supported in v0.`,
      );
    }

    const endpointKey = [
      fromDataset.name,
      join.from.column,
      toDataset.name,
      join.to.column,
    ].join('\u0000');

    if (joinEndpointKeys.has(endpointKey)) {
      issues.push(
        `Join "${join.name}": duplicates another join with the same datasets and columns.`,
      );
    } else {
      joinEndpointKeys.add(endpointKey);
    }

    const catalogJoin: CatalogJoin = {
      name: join.name,
      fromDataset: fromDataset.name,
      fromColumn: join.from.column,
      toDataset: toDataset.name,
      toColumn: join.to.column,
      type: join.type,
    };

    catalog.joins.push(catalogJoin);
  });

  // Dimensions: validate columns and build the global namespace.
  document.datasets.forEach((dataset) => {
    const catalogDataset = catalog.datasets.get(dataset.name);
    if (!catalogDataset) return;

    dataset.dimensions.forEach((dimension) => {
      const column = catalogDataset.columns.get(dimension.column);

      if (!column) {
        issues.push(
          `Dataset "${dataset.name}" dimension "${dimension.name}": column "${dimension.column}" does not exist on ${catalogDataset.schemaName}.${catalogDataset.objectName}.`,
        );
        return;
      }

      if (catalog.dimensions.has(dimension.name)) {
        issues.push(
          `Dimension name "${dimension.name}" is used more than once.`,
        );
        return;
      }

      const catalogDimension: CatalogDimension = {
        name: dimension.name,
        dataset: dataset.name,
        column: dimension.column,
        dataType: column.dataType,
        family: column.family,
      };

      catalogDataset.dimensions.set(dimension.name, catalogDimension);
      catalog.dimensions.set(dimension.name, catalogDimension);
    });
  });

  // Metrics: parse expressions and validate metric filters against the graph.
  document.datasets.forEach((dataset) => {
    const catalogDataset = catalog.datasets.get(dataset.name);
    if (!catalogDataset) return;

    dataset.metrics.forEach((metric) => {
      if (catalog.metrics.has(metric.name)) {
        issues.push(`Metric name "${metric.name}" is used more than once.`);
        return;
      }
      if (catalog.dimensions.has(metric.name)) {
        issues.push(
          `Metric name "${metric.name}" collides with a dimension name.`,
        );
        return;
      }

      let expression: MetricExpressionNode | null = null;
      let expressionValid = true;

      if (metric.expression) {
        try {
          expression = parseMetricExpression(metric.expression);
        } catch (error) {
          expressionValid = false;
          issues.push(
            `Metric "${metric.name}": ${
              error instanceof MetricExpressionError
                ? error.message
                : 'the expression could not be parsed.'
            }`,
          );
        }
      } else if (metric.agg !== 'count') {
        expressionValid = false;
        issues.push(`Metric "${metric.name}" needs an expression.`);
      }

      if (expression) {
        const columns = collectMetricExpressionColumns(expression);

        columns.forEach((columnName) => {
          const column = catalogDataset.columns.get(columnName);
          if (!column) {
            expressionValid = false;
            issues.push(
              `Metric "${metric.name}": expression references unknown column "${columnName}" on dataset "${dataset.name}".`,
            );
            return;
          }

          if (
            (metric.agg === 'sum' || metric.agg === 'avg') &&
            column.family !== 'numeric'
          ) {
            expressionValid = false;
            issues.push(
              `Metric "${metric.name}": ${metric.agg.toUpperCase()} needs numeric columns; "${columnName}" is ${column.dataType}.`,
            );
          }
        });
      }

      const filters: CatalogMetricFilter[] = [];

      metric.filters.forEach((filter) => {
        const dimension = catalog.dimensions.get(filter.dimension);

        if (!dimension) {
          issues.push(
            `Metric "${metric.name}": filter references unknown dimension "${filter.dimension}".`,
          );
          return;
        }

        let validated: ValidatedFilter<CatalogDimension>;
        try {
          validated = validateSemanticFilter(filter, dimension);
        } catch (error) {
          issues.push(
            `Metric "${metric.name}": ${
              error instanceof SemanticFilterError
                ? error.message
                : 'the filter could not be validated.'
            }`,
          );
          return;
        }

        const path = findJoinPath(
          catalog.joins,
          dataset.name,
          dimension.dataset,
        );

        if (!path) {
          issues.push(
            `Metric "${metric.name}": filter dimension "${filter.dimension}" belongs to dataset "${dimension.dataset}", which is not reachable from "${dataset.name}". Add the FK join first.`,
          );
          return;
        }

        filters.push(validated);
      });

      if (!expressionValid) return;

      const catalogMetric: CatalogMetric = {
        name: metric.name,
        dataset: dataset.name,
        aggregation: metric.agg,
        expression,
        filters,
      };

      catalogDataset.metrics.set(metric.name, catalogMetric);
      catalog.metrics.set(metric.name, catalogMetric);
    });
  });

  if (issues.length > 0) {
    throw new SemanticModelValidationError(issues);
  }

  return catalog;
}

/** Exposed for tests and for the compiler's reachability errors. */
export function findDatasetJoinPath(
  joins: readonly JoinEdge[],
  fromDataset: string,
  toDataset: string,
): JoinEdge[] | null {
  return findJoinPath(joins, fromDataset, toDataset);
}
