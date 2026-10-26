import { describe, expect, it } from 'vitest';
import {
  dashboardDocumentSchema,
  dashboardWriteSchema,
  MAX_WIDGETS,
} from './dashboard-document.schema.js';

const widgetId = '0b7a7a7e-4f5a-4a1a-9d0e-2f0c9b7d1a11';
const otherWidgetId = '1c8b8b8f-5a6b-4b2b-ae1f-3a1d0c8e2b22';

function widget(overrides: Record<string, unknown> = {}) {
  return {
    id: widgetId,
    layout: { x: 0, y: 0, w: 6, h: 5 },
    chart: {
      v: 1,
      type: 'bar',
      title: 'Revenue by category',
      query: { metrics: ['revenue'], dimensions: ['product_category'] },
      x: 'product_category',
      y: 'revenue',
    },
    ...overrides,
  };
}

function issues(input: unknown, schema = dashboardDocumentSchema): string[] {
  const result = schema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.message);
}

describe('dashboardDocumentSchema', () => {
  it('accepts an empty dashboard and defaults filters to {}', () => {
    const parsed = dashboardDocumentSchema.parse({ name: 'Overview' });

    expect(parsed.filters).toEqual({});
    expect(parsed.widgets).toEqual([]);
  });

  it('accepts widgets with charts and layouts', () => {
    const parsed = dashboardDocumentSchema.parse({
      name: 'Revenue overview',
      filters: { categorical: { dimension: 'order_status', value: 'paid' } },
      widgets: [widget(), widget({ id: otherWidgetId, layout: { x: 6, y: 0, w: 6, h: 5 } })],
    });

    expect(parsed.widgets).toHaveLength(2);
    expect(parsed.widgets[0]!.chart.type).toBe('bar');
  });

  it('rejects duplicate widget ids', () => {
    expect(
      issues({ name: 'Overview', widgets: [widget(), widget()] }).join(' '),
    ).toContain('is used more than once');
  });

  it('rejects widgets that overflow the 12-column grid', () => {
    expect(
      issues({
        name: 'Overview',
        widgets: [widget({ layout: { x: 8, y: 0, w: 6, h: 5 } })],
      }).join(' '),
    ).toContain('wider than the 12-column grid');
  });

  it('rejects an invalid chart inside a widget', () => {
    expect(
      issues({
        name: 'Overview',
        widgets: [widget({ chart: { v: 1, type: 'pie', title: 'Nope' } })],
      }).join(' ').toLowerCase(),
    ).toContain('discriminator');
  });

  it('caps the number of widgets', () => {
    const widgets = Array.from({ length: MAX_WIDGETS + 1 }, (_, index) =>
      widget({
        id: `0b7a7a7e-4f5a-4a1a-9d0e-${String(index).padStart(12, '0')}`,
      }),
    );

    expect(issues({ name: 'Overview', widgets }).join(' ')).toContain(
      '<=12 items',
    );
  });

  it('requires a name', () => {
    expect(issues({ name: '   ' }).join(' ')).toContain('needs a name');
  });

  it('requires a version on writes', () => {
    expect(
      issues({ name: 'Overview', widgets: [] }, dashboardWriteSchema).join(' '),
    ).toContain('expected number');

    expect(
      issues(
        { name: 'Overview', widgets: [], expectedVersion: 2 },
        dashboardWriteSchema,
      ),
    ).toEqual([]);
  });
});
