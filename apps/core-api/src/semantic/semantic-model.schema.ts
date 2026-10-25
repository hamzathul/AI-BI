import { z } from 'zod';
import { isForbiddenSqlKeyword } from '../query/sql-guard.js';
import { semanticFilterSchema } from './semantic-filter.js';

/** Metric/dimension/dataset/join names become identifiers or query keys. */
export const semanticNameSchema = z
  .string()
  .min(1, 'Name is required.')
  .max(64, 'Name must be at most 64 characters.')
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'Use lower_snake_case: start with a letter, then lowercase letters, digits, or underscores.',
  )
  .refine(
    (name) => !isForbiddenSqlKeyword(name),
    'This name is a reserved SQL keyword. Choose another name.',
  );

const descriptionSchema = z.string().max(2_000);

const sourceSchema = z
  .object({
    schema: z.string().min(1).max(128),
    object: z.string().min(1).max(128),
  })
  .strict();

const columnSchema = z.string().min(1).max(128);

export const semanticDimensionSchema = z
  .object({
    name: semanticNameSchema,
    column: columnSchema,
    description: descriptionSchema.optional(),
  })
  .strict();

export const AGGREGATIONS = [
  'count',
  'count_distinct',
  'sum',
  'avg',
  'min',
  'max',
] as const;

export const aggregationSchema = z.enum(AGGREGATIONS);

export const semanticMetricSchema = z
  .object({
    name: semanticNameSchema,
    agg: aggregationSchema,
    expression: z.string().min(1).max(500).optional(),
    description: descriptionSchema.optional(),
    filters: z.array(semanticFilterSchema).max(20).default([]),
  })
  .strict()
  .superRefine((metric, ctx) => {
    if (metric.agg !== 'count' && !metric.expression) {
      ctx.addIssue({
        code: 'custom',
        message: `Metric "${metric.name}" needs an expression.`,
        path: ['expression'],
      });
    }
  });

export const semanticDatasetSchema = z
  .object({
    name: semanticNameSchema,
    source: sourceSchema,
    description: descriptionSchema.optional(),
    dimensions: z.array(semanticDimensionSchema).max(100).default([]),
    metrics: z.array(semanticMetricSchema).max(100).default([]),
  })
  .strict();

const joinEndpointSchema = z
  .object({
    dataset: semanticNameSchema,
    column: columnSchema,
  })
  .strict();

export const JOIN_TYPES = ['left', 'inner'] as const;

export const semanticJoinSchema = z
  .object({
    name: semanticNameSchema,
    from: joinEndpointSchema,
    to: joinEndpointSchema,
    type: z.enum(JOIN_TYPES).default('left'),
  })
  .strict();

/**
 * The whole editable semantic model.
 *
 * Structural checks live here; checks that need the metadata snapshot (does the
 * table exist, is this a real FK?) live in `buildSemanticCatalog`.
 */
export const semanticModelDocumentSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: descriptionSchema.optional(),
    datasets: z.array(semanticDatasetSchema).min(1).max(100),
    joins: z.array(semanticJoinSchema).max(200).default([]),
  })
  .strict()
  .superRefine((document, ctx) => {
    const datasetNames = new Set<string>();
    const dimensionNames = new Set<string>();
    let metricCount = 0;

    // Pass 1: dataset and dimension names. Metric filters may point at a
    // dimension defined in a later dataset, so the full set must exist before
    // filters are checked.
    document.datasets.forEach((dataset, datasetIndex) => {
      if (datasetNames.has(dataset.name)) {
        ctx.addIssue({
          code: 'custom',
          message: `Dataset name "${dataset.name}" is used more than once.`,
          path: ['datasets', datasetIndex, 'name'],
        });
      }
      datasetNames.add(dataset.name);

      dataset.dimensions.forEach((dimension) => {
        dimensionNames.add(dimension.name);
      });
      metricCount += dataset.metrics.length;
    });

    // Pass 2: one global namespace for metrics + dimensions, dimensions first.
    const valueNames = new Map<string, string>();

    document.datasets.forEach((dataset, datasetIndex) => {
      dataset.dimensions.forEach((dimension, dimensionIndex) => {
        const previous = valueNames.get(dimension.name);
        if (previous) {
          ctx.addIssue({
            code: 'custom',
            message: `Name "${dimension.name}" is already used by ${previous}. Metrics and dimensions share one namespace.`,
            path: [
              'datasets',
              datasetIndex,
              'dimensions',
              dimensionIndex,
              'name',
            ],
          });
        } else {
          valueNames.set(
            dimension.name,
            `dimension "${dimension.name}" in dataset "${dataset.name}"`,
          );
        }
      });
    });

    document.datasets.forEach((dataset, datasetIndex) => {
      dataset.metrics.forEach((metric, metricIndex) => {
        const previous = valueNames.get(metric.name);
        if (previous) {
          ctx.addIssue({
            code: 'custom',
            message: `Name "${metric.name}" is already used by ${previous}. Metrics and dimensions share one namespace.`,
            path: ['datasets', datasetIndex, 'metrics', metricIndex, 'name'],
          });
        } else {
          valueNames.set(
            metric.name,
            `metric "${metric.name}" in dataset "${dataset.name}"`,
          );
        }

        metric.filters.forEach((filter, filterIndex) => {
          if (!dimensionNames.has(filter.dimension)) {
            ctx.addIssue({
              code: 'custom',
              message: `Metric filter references unknown dimension "${filter.dimension}".`,
              path: [
                'datasets',
                datasetIndex,
                'metrics',
                metricIndex,
                'filters',
                filterIndex,
                'dimension',
              ],
            });
          }
        });
      });
    });

    if (metricCount === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'A semantic model needs at least one metric.',
        path: ['datasets'],
      });
    }

    const joinNames = new Set<string>();
    document.joins.forEach((join, index) => {
      if (joinNames.has(join.name)) {
        ctx.addIssue({
          code: 'custom',
          message: `Join name "${join.name}" is used more than once.`,
          path: ['joins', index, 'name'],
        });
      }
      joinNames.add(join.name);

      if (!datasetNames.has(join.from.dataset)) {
        ctx.addIssue({
          code: 'custom',
          message: `Join "${join.name}" references unknown dataset "${join.from.dataset}".`,
          path: ['joins', index, 'from', 'dataset'],
        });
      }
      if (!datasetNames.has(join.to.dataset)) {
        ctx.addIssue({
          code: 'custom',
          message: `Join "${join.name}" references unknown dataset "${join.to.dataset}".`,
          path: ['joins', index, 'to', 'dataset'],
        });
      }
      if (join.from.dataset === join.to.dataset) {
        ctx.addIssue({
          code: 'custom',
          message: `Join "${join.name}" is a self-join. Self-joins are not supported in v0.`,
          path: ['joins', index],
        });
      }
    });
  });

export type SemanticModelDocument = z.infer<typeof semanticModelDocumentSchema>;
export type SemanticDataset = z.infer<typeof semanticDatasetSchema>;
export type SemanticDimension = z.infer<typeof semanticDimensionSchema>;
export type SemanticMetric = z.infer<typeof semanticMetricSchema>;
export type SemanticJoin = z.infer<typeof semanticJoinSchema>;
export type Aggregation = z.infer<typeof aggregationSchema>;
