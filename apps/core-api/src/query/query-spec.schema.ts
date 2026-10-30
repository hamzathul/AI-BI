import { z } from 'zod';
import { semanticNameSchema } from '../semantic/semantic-model.schema.js';
import { semanticFilterSchema } from '../semantic/semantic-filter.js';
import {
  QUERY_MAX_DIMENSIONS,
  QUERY_MAX_FILTERS,
  QUERY_MAX_METRICS,
  QUERY_MAX_ORDER_BY,
  QUERY_MAX_ROWS,
} from './query.constants.js';

export const TIME_GRAINS = ['day', 'week', 'month', 'quarter', 'year'] as const;

export type TimeGrain = (typeof TIME_GRAINS)[number];

const orderFieldSchema = semanticNameSchema;

/**
 * The only query language the backend accepts (D9/D51).
 *
 * No SQL, no table names, no arbitrary expressions. Metric and dimension names
 * are resolved against the saved semantic model; every filter value is bound.
 */
export const querySpecSchema = z
  .object({
    dataset: semanticNameSchema.optional(),
    metrics: z.array(semanticNameSchema).min(1).max(QUERY_MAX_METRICS),
    dimensions: z
      .array(semanticNameSchema)
      .max(QUERY_MAX_DIMENSIONS)
      .default([]),
    timeGrain: z
      .object({
        dimension: semanticNameSchema,
        grain: z.enum(TIME_GRAINS),
      })
      .strict()
      .optional(),
    filters: z.array(semanticFilterSchema).max(QUERY_MAX_FILTERS).default([]),
    orderBy: z
      .array(
        z
          .object({
            field: orderFieldSchema,
            direction: z.enum(['asc', 'desc']).default('asc'),
          })
          .strict(),
      )
      .max(QUERY_MAX_ORDER_BY)
      .default([]),
    limit: z.number().int().min(1).max(QUERY_MAX_ROWS).optional(),
  })
  .strict()
  .superRefine((spec, ctx) => {
    if (new Set(spec.metrics).size !== spec.metrics.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'metrics must not contain duplicates.',
        path: ['metrics'],
      });
    }

    if (new Set(spec.dimensions).size !== spec.dimensions.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'dimensions must not contain duplicates.',
        path: ['dimensions'],
      });
    }

    const orderFields = spec.orderBy.map((entry) => entry.field);
    if (new Set(orderFields).size !== orderFields.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'orderBy fields must not contain duplicates.',
        path: ['orderBy'],
      });
    }

    if (spec.timeGrain && spec.dimensions.includes(spec.timeGrain.dimension)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'The timeGrain dimension cannot also appear in dimensions; the grain is already selected.',
        path: ['timeGrain', 'dimension'],
      });
    }
  });

export type QuerySpec = z.infer<typeof querySpecSchema>;
