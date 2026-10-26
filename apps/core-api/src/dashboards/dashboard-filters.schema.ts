import { z } from 'zod';
import { semanticNameSchema } from '../semantic/semantic-model.schema.js';

/**
 * Dashboard-level filters v0 (D55).
 *
 * A dashboard filter is declarative, not SQL: it names a semantic dimension and
 * a value. The server rewrites each widget's QuerySpec at execution time, so
 * widgets stay independently runnable and filters never become hidden state.
 */
const dateValueSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date in YYYY-MM-DD form.');

export const dashboardFilterValueSchema = z.union([
  z.string().min(1).max(200),
  z.array(z.string().min(1).max(200)).min(1).max(50),
]);

export const dashboardFiltersSchema = z
  .object({
    dateRange: z
      .object({
        dimension: semanticNameSchema,
        from: dateValueSchema.optional(),
        to: dateValueSchema.optional(),
      })
      .strict()
      .superRefine((range, ctx) => {
        if (!range.from && !range.to) {
          ctx.addIssue({
            code: 'custom',
            message: 'A date range needs a start, an end, or both.',
            path: [],
          });
        }

        if (range.from && range.to && range.from > range.to) {
          ctx.addIssue({
            code: 'custom',
            message: 'The start date is after the end date.',
            path: ['from'],
          });
        }
      })
      .optional(),
    categorical: z
      .object({
        dimension: semanticNameSchema,
        value: dashboardFilterValueSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
