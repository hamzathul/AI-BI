import { NotFoundException } from '@nestjs/common';
import { ACME_SEMANTIC_MODEL } from '../semantic/acme-model.js';
import { buildSemanticCatalog } from '../semantic/semantic-model.validation.js';
import type { SemanticService } from '../semantic/semantic.service.js';
import { acmeMetadata } from '../../test/fixtures/acme-metadata.js';
import { InternalContextService } from './internal-context.service.js';

function serviceReturning(
  catalog: ReturnType<typeof buildSemanticCatalog> | null,
) {
  const semanticService = {
    getCatalog: async () =>
      catalog ? { catalog, modelId: 'model-1', modelName: 'Acme Inc.' } : null,
  } as unknown as SemanticService;

  return new InternalContextService(semanticService);
}

function acmeCatalog() {
  return buildSemanticCatalog(ACME_SEMANTIC_MODEL, acmeMetadata, {
    modelId: 'model-1',
  });
}

describe('InternalContextService', () => {
  it('describes the model with datasets, joins, and capabilities', async () => {
    const context = await serviceReturning(acmeCatalog()).getContext();

    expect(context.model).toEqual({
      id: 'model-1',
      name: 'Acme Inc.',
      description: ACME_SEMANTIC_MODEL.description,
    });
    expect(context.datasets.map((dataset) => dataset.name)).toEqual([
      'customers',
      'departments',
      'employees',
      'order_items',
      'orders',
      'products',
    ]);
    expect(context.joins.map((join) => join.name)).toEqual([
      'employees_department',
      'order_items_order',
      'order_items_product',
      'orders_customer',
    ]);
  });

  it('exposes descriptions, types, and metric filters', async () => {
    const context = await serviceReturning(acmeCatalog()).getContext();
    const employees = context.datasets.find(
      (dataset) => dataset.name === 'employees',
    );

    expect(employees).toBeDefined();
    expect(employees?.source).toEqual({ schema: 'hr', object: 'employees' });
    expect(employees?.description).toBe(
      'One row per employee, including inactive people.',
    );
    expect(employees?.dimensions).toContainEqual({
      name: 'hire_date',
      column: 'hire_date',
      dataType: 'date',
      family: 'date',
      description: 'Date the employee joined.',
    });
    expect(
      employees?.metrics.find((metric) => metric.name === 'headcount'),
    ).toEqual({
      name: 'headcount',
      agg: 'count',
      expression: 'id',
      description: 'Active employees (is_active = true).',
      filters: [{ dimension: 'is_active', operator: 'eq', value: true }],
    });
  });

  it('advertises the compiler limits the spec must respect', async () => {
    const context = await serviceReturning(acmeCatalog()).getContext();

    expect(context.capabilities).toEqual({
      timeGrains: ['day', 'week', 'month', 'quarter', 'year'],
      filterOperators: [
        'eq',
        'neq',
        'in',
        'not_in',
        'gt',
        'gte',
        'lt',
        'lte',
        'between',
        'is_null',
        'is_not_null',
      ],
      maxMetrics: 20,
      maxDimensions: 20,
      maxFilters: 20,
      maxOrderBy: 10,
      maxRows: 10_000,
      defaultLimit: 1_000,
    });
  });

  it('does not expose physical columns or source rows', async () => {
    const context = await serviceReturning(acmeCatalog()).getContext();
    const employees = context.datasets.find(
      (dataset) => dataset.name === 'employees',
    );

    expect(employees).not.toHaveProperty('columns');
    expect(JSON.stringify(context)).not.toContain('rowCount');
  });

  it('returns a 404 when no semantic model is saved', async () => {
    await expect(serviceReturning(null).getContext()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
