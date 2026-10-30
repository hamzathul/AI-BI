import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_QUERY_LIMIT,
  QUERY_MAX_DIMENSIONS,
  QUERY_MAX_FILTERS,
  QUERY_MAX_METRICS,
  QUERY_MAX_ORDER_BY,
  QUERY_MAX_ROWS,
} from '../query/query.constants.js';
import { TIME_GRAINS } from '../query/query-spec.schema.js';
import type { SemanticCatalogContext } from '../semantic/semantic.service.js';
import { SemanticService } from '../semantic/semantic.service.js';
import { FILTER_OPERATORS } from '../semantic/semantic-filter.js';
import type { InternalContextDto } from './internal.dto.js';

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, 'en');
}

/**
 * Catalog → prompt-ready context (D60).
 *
 * Built from the *validated* catalog, not the raw saved document: if a metadata
 * re-sync removed a table, this fails here instead of producing specs the
 * compiler will reject. Sorting makes the payload stable across requests,
 * which keeps prompts and eval snapshots reproducible.
 */
export function toInternalContext(
  context: SemanticCatalogContext,
): InternalContextDto {
  const { catalog } = context;

  return {
    model: {
      id: context.modelId,
      name: context.modelName,
      ...(catalog.model.description
        ? { description: catalog.model.description }
        : {}),
    },
    datasets: [...catalog.datasets.values()].sort(byName).map((dataset) => ({
      name: dataset.name,
      source: { schema: dataset.schemaName, object: dataset.objectName },
      ...(dataset.description ? { description: dataset.description } : {}),
      dimensions: [...dataset.dimensions.values()].sort(byName).map((dim) => ({
        name: dim.name,
        column: dim.column,
        dataType: dim.dataType,
        family: dim.family,
        ...(dim.description ? { description: dim.description } : {}),
      })),
      metrics: [...dataset.metrics.values()].sort(byName).map((metric) => ({
        name: metric.name,
        agg: metric.aggregation,
        expression: metric.expressionText,
        ...(metric.description ? { description: metric.description } : {}),
        filters: metric.filters.map((filter) => ({
          dimension: filter.dimension.name,
          operator: filter.operator,
          ...(filter.value !== undefined ? { value: filter.value } : {}),
        })),
      })),
    })),
    joins: [...catalog.joins].sort(byName).map((join) => ({
      name: join.name,
      from: { dataset: join.fromDataset, column: join.fromColumn },
      to: { dataset: join.toDataset, column: join.toColumn },
      type: join.type,
    })),
    capabilities: {
      timeGrains: TIME_GRAINS,
      filterOperators: FILTER_OPERATORS,
      maxMetrics: QUERY_MAX_METRICS,
      maxDimensions: QUERY_MAX_DIMENSIONS,
      maxFilters: QUERY_MAX_FILTERS,
      maxOrderBy: QUERY_MAX_ORDER_BY,
      maxRows: QUERY_MAX_ROWS,
      defaultLimit: DEFAULT_QUERY_LIMIT,
    },
  };
}

@Injectable()
export class InternalContextService {
  constructor(private readonly semanticService: SemanticService) {}

  async getContext(): Promise<InternalContextDto> {
    const context = await this.semanticService.getCatalog();

    if (!context) {
      throw new NotFoundException(
        'No semantic model is saved. Save one with PUT /api/semantic/model before asking questions.',
      );
    }

    return toInternalContext(context);
  }
}
