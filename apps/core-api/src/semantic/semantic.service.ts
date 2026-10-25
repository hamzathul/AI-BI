import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type {
  Aggregation as PrismaAggregation,
  FilterOperator as PrismaFilterOperator,
  JoinType as PrismaJoinType,
} from '../generated/prisma/enums.js';
import { MetadataService } from '../metadata/metadata.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ACME_SEMANTIC_MODEL } from './acme-model.js';
import type { SemanticCatalog } from './semantic-catalog.js';
import type {
  SemanticExampleResponseDto,
  SemanticModelResponseDto,
  SemanticModelSummaryDto,
  SemanticValidationResponseDto,
} from './semantic.dto.js';
import type { FilterOperator, FilterValue } from './semantic-filter.js';
import {
  semanticModelDocumentSchema,
  type Aggregation,
  type SemanticModelDocument,
} from './semantic-model.schema.js';
import {
  buildSemanticCatalog,
  SemanticModelValidationError,
} from './semantic-model.validation.js';

export interface SemanticCatalogContext {
  catalog: SemanticCatalog;
  modelId: string;
  modelName: string;
}

interface StoredDimension {
  id: string;
  name: string;
  columnName: string;
  description: string | null;
}

interface StoredMetricFilter {
  dimensionId: string;
  operator: PrismaFilterOperator;
  value: Prisma.JsonValue;
  position: number;
}

interface StoredMetric {
  id: string;
  name: string;
  aggregation: PrismaAggregation;
  expression: string | null;
  description: string | null;
  filters: StoredMetricFilter[];
}

interface StoredDataset {
  id: string;
  name: string;
  schemaName: string;
  objectName: string;
  description: string | null;
  dimensions: StoredDimension[];
  metrics: StoredMetric[];
}

interface StoredJoin {
  name: string;
  fromDatasetId: string;
  fromColumn: string;
  toDatasetId: string;
  toColumn: string;
  joinType: PrismaJoinType;
}

interface StoredModel {
  id: string;
  name: string;
  description: string | null;
  updatedAt: Date;
  datasets: StoredDataset[];
  joins: StoredJoin[];
}

const AGGREGATION_TO_PRISMA: Record<Aggregation, PrismaAggregation> = {
  count: 'COUNT',
  count_distinct: 'COUNT_DISTINCT',
  sum: 'SUM',
  avg: 'AVG',
  min: 'MIN',
  max: 'MAX',
};

const AGGREGATION_FROM_PRISMA: Record<PrismaAggregation, Aggregation> = {
  COUNT: 'count',
  COUNT_DISTINCT: 'count_distinct',
  SUM: 'sum',
  AVG: 'avg',
  MIN: 'min',
  MAX: 'max',
};

const OPERATOR_TO_PRISMA: Record<FilterOperator, PrismaFilterOperator> = {
  eq: 'EQ',
  neq: 'NEQ',
  in: 'IN',
  not_in: 'NOT_IN',
  gt: 'GT',
  gte: 'GTE',
  lt: 'LT',
  lte: 'LTE',
  between: 'BETWEEN',
  is_null: 'IS_NULL',
  is_not_null: 'IS_NOT_NULL',
};

const OPERATOR_FROM_PRISMA: Record<PrismaFilterOperator, FilterOperator> = {
  EQ: 'eq',
  NEQ: 'neq',
  IN: 'in',
  NOT_IN: 'not_in',
  GT: 'gt',
  GTE: 'gte',
  LT: 'lt',
  LTE: 'lte',
  BETWEEN: 'between',
  IS_NULL: 'is_null',
  IS_NOT_NULL: 'is_not_null',
};

const JOIN_TO_PRISMA: Record<'left' | 'inner', PrismaJoinType> = {
  left: 'LEFT',
  inner: 'INNER',
};

const JOIN_FROM_PRISMA: Record<PrismaJoinType, 'left' | 'inner'> = {
  LEFT: 'left',
  INNER: 'inner',
};

function datasetValueKey(dataset: string, dimension: string): string {
  return `${dataset}\u0000${dimension}`;
}

@Injectable()
export class SemanticService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metadataService: MetadataService,
  ) {}

  /**
   * One model per deployment (D49). The read is ordered by `updatedAt` so a
   * stray second row (from a manual SQL insert) cannot shadow the newest one.
   */
  private findStoredModel() {
    return this.prisma.semanticModel.findFirst({
      include: {
        datasets: {
          include: {
            dimensions: { orderBy: { name: 'asc' } },
            metrics: {
              include: { filters: { orderBy: { position: 'asc' } } },
              orderBy: { name: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
        },
        joins: { orderBy: { name: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getModel(): Promise<SemanticModelResponseDto> {
    const stored = await this.findStoredModel();

    if (!stored) {
      return { model: null, updatedAt: null };
    }

    return {
      model: toDocument(stored as StoredModel),
      updatedAt: stored.updatedAt.toISOString(),
    };
  }

  getExample(): SemanticExampleResponseDto {
    return {
      model: semanticModelDocumentSchema.parse(ACME_SEMANTIC_MODEL),
    };
  }

  async validate(
    document: SemanticModelDocument,
  ): Promise<SemanticValidationResponseDto> {
    const catalog = await this.validateAgainstMetadata(document);
    return { valid: true, summary: summarize(catalog) };
  }

  /**
   * Replaces the whole model in one transaction. A PUT is the unit of edit, so
   * a half-updated dataset graph never reaches a query (D49).
   */
  async save(
    document: SemanticModelDocument,
  ): Promise<SemanticModelResponseDto> {
    await this.validateAgainstMetadata(document);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.semanticModel.findFirst({
        select: { id: true },
      });

      let modelId: string;

      if (existing) {
        // Joins reference datasets, so remove them first. Deleting datasets
        // then cascades dimensions, metrics, and metric filters.
        await tx.semanticJoin.deleteMany({ where: { modelId: existing.id } });
        await tx.dataset.deleteMany({ where: { modelId: existing.id } });
        await tx.semanticModel.update({
          where: { id: existing.id },
          data: {
            name: document.name,
            description: document.description ?? null,
          },
        });
        modelId = existing.id;
      } else {
        const created = await tx.semanticModel.create({
          data: {
            name: document.name,
            description: document.description ?? null,
          },
        });
        modelId = created.id;
      }

      const datasetIds = new Map<string, string>();
      const dimensionIds = new Map<string, string>();
      const metricIds = new Map<string, string>();

      for (const dataset of document.datasets) {
        const created = await tx.dataset.create({
          data: {
            modelId,
            name: dataset.name,
            schemaName: dataset.source.schema,
            objectName: dataset.source.object,
            description: dataset.description ?? null,
            ...(dataset.dimensions.length > 0
              ? {
                  dimensions: {
                    create: dataset.dimensions.map((dimension) => ({
                      name: dimension.name,
                      columnName: dimension.column,
                      description: dimension.description ?? null,
                    })),
                  },
                }
              : {}),
            ...(dataset.metrics.length > 0
              ? {
                  metrics: {
                    create: dataset.metrics.map((metric) => ({
                      name: metric.name,
                      aggregation: AGGREGATION_TO_PRISMA[metric.agg],
                      expression: metric.expression ?? null,
                      description: metric.description ?? null,
                    })),
                  },
                }
              : {}),
          },
          include: { dimensions: true, metrics: true },
        });

        datasetIds.set(dataset.name, created.id);
        created.dimensions.forEach((dimension) => {
          dimensionIds.set(dimension.name, dimension.id);
        });
        created.metrics.forEach((metric) => {
          metricIds.set(datasetValueKey(dataset.name, metric.name), metric.id);
        });
      }

      for (const dataset of document.datasets) {
        for (const metric of dataset.metrics) {
          const metricId = metricIds.get(
            datasetValueKey(dataset.name, metric.name),
          );

          if (!metricId) {
            throw new Error(
              `Internal error: metric "${dataset.name}.${metric.name}" was not stored.`,
            );
          }

          for (const [position, filter] of metric.filters.entries()) {
            const dimensionId = dimensionIds.get(filter.dimension);

            if (!dimensionId) {
              throw new Error(
                `Internal error: filter dimension "${filter.dimension}" was not stored.`,
              );
            }

            await tx.metricFilter.create({
              data: {
                metricId,
                dimensionId,
                operator: OPERATOR_TO_PRISMA[filter.operator],
                value:
                  filter.value === undefined
                    ? Prisma.JsonNull
                    : (filter.value as Prisma.InputJsonValue),
                position,
              },
            });
          }
        }
      }

      if (document.joins.length > 0) {
        await tx.semanticJoin.createMany({
          data: document.joins.map((join) => ({
            modelId,
            name: join.name,
            fromDatasetId: datasetIds.get(join.from.dataset)!,
            fromColumn: join.from.column,
            toDatasetId: datasetIds.get(join.to.dataset)!,
            toColumn: join.to.column,
            joinType: JOIN_TO_PRISMA[join.type],
          })),
        });
      }
    });

    return this.getModel();
  }

  async delete(): Promise<void> {
    await this.prisma.semanticModel.deleteMany();
  }

  /**
   * Loads the saved model and resolves it against the current metadata. The
   * query path uses this, so a metadata re-sync that removed a table produces
   * a clear 400 instead of a database error (D41/D49).
   */
  async getCatalog(): Promise<SemanticCatalogContext | null> {
    const stored = await this.findStoredModel();

    if (!stored) return null;

    return {
      catalog: await this.validateAgainstMetadata(
        toDocument(stored as StoredModel),
        stored.id,
      ),
      modelId: stored.id,
      modelName: stored.name,
    };
  }

  private async validateAgainstMetadata(
    document: SemanticModelDocument,
    modelId?: string,
  ): Promise<SemanticCatalog> {
    const metadata = await this.metadataService.getMetadata();

    try {
      return buildSemanticCatalog(document, metadata, { modelId });
    } catch (error) {
      if (error instanceof SemanticModelValidationError) {
        throw new BadRequestException(error.issues);
      }
      throw error;
    }
  }
}

function summarize(catalog: SemanticCatalog): SemanticModelSummaryDto {
  return {
    datasets: catalog.datasets.size,
    dimensions: catalog.dimensions.size,
    metrics: catalog.metrics.size,
    joins: catalog.joins.length,
  };
}

function toDocument(stored: StoredModel): SemanticModelDocument {
  const datasetNames = new Map(
    stored.datasets.map((dataset) => [dataset.id, dataset.name]),
  );
  const dimensionNames = new Map(
    stored.datasets.flatMap((dataset) =>
      dataset.dimensions.map(
        (dimension) => [dimension.id, dimension.name] as const,
      ),
    ),
  );

  return {
    name: stored.name,
    ...(stored.description ? { description: stored.description } : {}),
    datasets: stored.datasets.map((dataset) => ({
      name: dataset.name,
      source: { schema: dataset.schemaName, object: dataset.objectName },
      ...(dataset.description ? { description: dataset.description } : {}),
      dimensions: dataset.dimensions.map((dimension) => ({
        name: dimension.name,
        column: dimension.columnName,
        ...(dimension.description
          ? { description: dimension.description }
          : {}),
      })),
      metrics: dataset.metrics.map((metric) => ({
        name: metric.name,
        agg: AGGREGATION_FROM_PRISMA[metric.aggregation],
        ...(metric.expression ? { expression: metric.expression } : {}),
        ...(metric.description ? { description: metric.description } : {}),
        filters: metric.filters.map((filter) => ({
          dimension: dimensionNames.get(filter.dimensionId)!,
          operator: OPERATOR_FROM_PRISMA[filter.operator],
          ...(filter.value !== null
            ? { value: filter.value as FilterValue }
            : {}),
        })),
      })),
    })),
    joins: stored.joins.map((join) => ({
      name: join.name,
      from: {
        dataset: datasetNames.get(join.fromDatasetId)!,
        column: join.fromColumn,
      },
      to: {
        dataset: datasetNames.get(join.toDatasetId)!,
        column: join.toColumn,
      },
      type: JOIN_FROM_PRISMA[join.joinType],
    })),
  };
}
