import { z } from 'zod';
import { dashboardFiltersSchema } from '../dashboards/dashboard-filters.schema.js';
import { chartSpecSchema } from './chart-spec.schema.js';

/** Keeps one canvas refresh to a handful of source queries (D55). */
export const MAX_CHARTS_PER_REQUEST = 12;

export const chartExecutionRequestSchema = z
  .object({
    filters: dashboardFiltersSchema.optional(),
    charts: z
      .array(
        z
          .object({
            id: z.uuid('Chart ids must be UUIDs.'),
            chart: chartSpecSchema,
          })
          .strict(),
      )
      .min(1)
      .max(MAX_CHARTS_PER_REQUEST),
  })
  .strict()
  .superRefine((request, ctx) => {
    const ids = new Set<string>();

    request.charts.forEach((item, index) => {
      if (ids.has(item.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Chart id "${item.id}" is used more than once.`,
          path: ['charts', index, 'id'],
        });
      }
      ids.add(item.id);
    });
  });

export type ChartExecutionRequest = z.infer<typeof chartExecutionRequestSchema>;
