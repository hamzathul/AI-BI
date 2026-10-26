import { z } from 'zod';
import { chartSpecSchema } from '../charts/chart-spec.schema.js';
import { dashboardFiltersSchema } from './dashboard-filters.schema.js';

/** v0 keeps the canvas small enough to execute in one batch. */
export const MAX_WIDGETS = 12;
export const GRID_COLUMNS = 12;

export const dashboardNameSchema = z
  .string()
  .trim()
  .min(1, 'A dashboard needs a name.')
  .max(120);

export const widgetLayoutSchema = z
  .object({
    /** Grid column (0-based) and row. */
    x: z.number().int().min(0).max(GRID_COLUMNS - 1),
    y: z.number().int().min(0).max(10_000),
    /** Width/height in grid units. */
    w: z.number().int().min(2).max(GRID_COLUMNS),
    h: z.number().int().min(2).max(20),
  })
  .strict();

export const dashboardWidgetSchema = z
  .object({
    id: z.uuid('Widget ids must be UUIDs.'),
    chart: chartSpecSchema,
    layout: widgetLayoutSchema,
  })
  .strict();

const dashboardBaseShape = {
  name: dashboardNameSchema,
  filters: dashboardFiltersSchema.default({}),
  widgets: z.array(dashboardWidgetSchema).max(MAX_WIDGETS).default([]),
};

type DashboardShape = {
  widgets: Array<{ id: string; layout: { x: number; w: number } }>;
};

function refineDashboard(document: DashboardShape, ctx: z.RefinementCtx) {
  const ids = new Set<string>();

  document.widgets.forEach((widget, index) => {
    if (ids.has(widget.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `Widget id "${widget.id}" is used more than once.`,
        path: ['widgets', index, 'id'],
      });
    }
    ids.add(widget.id);

    if (widget.layout.x + widget.layout.w > GRID_COLUMNS) {
      ctx.addIssue({
        code: 'custom',
        message: `Widget ${index + 1} is wider than the ${GRID_COLUMNS}-column grid.`,
        path: ['widgets', index, 'layout', 'w'],
      });
    }
  });
}

/**
 * The whole editable dashboard: name, filters, widgets (5.5).
 *
 * One document per save keeps a widget's chart and layout inseparable and makes
 * the version check a single row update in Phase 7's patch model.
 */
export const dashboardDocumentSchema = z
  .object(dashboardBaseShape)
  .strict()
  .superRefine(refineDashboard);

export const dashboardWriteSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    ...dashboardBaseShape,
  })
  .strict()
  .superRefine(refineDashboard);

export const dashboardCreateSchema = z
  .object({ name: dashboardNameSchema })
  .strict();

export type DashboardDocument = z.infer<typeof dashboardDocumentSchema>;
export type DashboardWrite = z.infer<typeof dashboardWriteSchema>;
export type DashboardWidget = z.infer<typeof dashboardWidgetSchema>;
