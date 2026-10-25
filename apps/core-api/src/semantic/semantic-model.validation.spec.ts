import { describe, expect, it } from 'vitest';
import { acmeMetadata } from '../../test/fixtures/acme-metadata.js';
import { ACME_SEMANTIC_MODEL } from './acme-model.js';
import {
  buildSemanticCatalog,
  SemanticModelValidationError,
} from './semantic-model.validation.js';
import { semanticModelDocumentSchema } from './semantic-model.schema.js';

function parse(document: unknown) {
  return semanticModelDocumentSchema.parse(document);
}

function expectIssues(document: unknown, metadata = acmeMetadata): string[] {
  const parsed = parse(document);
  try {
    buildSemanticCatalog(parsed, metadata);
  } catch (error) {
    expect(error).toBeInstanceOf(SemanticModelValidationError);
    return (error as SemanticModelValidationError).issues;
  }
  throw new Error('Expected semantic model validation to fail');
}

describe('semantic model validation', () => {
  it('builds the Acme model against the Acme metadata', () => {
    const catalog = buildSemanticCatalog(
      parse(ACME_SEMANTIC_MODEL),
      acmeMetadata,
      { modelId: 'model-1' },
    );

    expect(catalog.model.id).toBe('model-1');
    expect(catalog.datasets.size).toBe(6);
    expect(catalog.dimensions.size).toBe(11);
    expect(catalog.metrics.size).toBe(11);
    expect(catalog.joins).toHaveLength(4);

    const revenue = catalog.metrics.get('revenue');
    expect(revenue?.dataset).toBe('order_items');
    expect(revenue?.filters).toHaveLength(1);
    expect(revenue?.filters[0]?.dimension.dataset).toBe('orders');
    expect(revenue?.filters[0]?.dimension.column).toBe('status');
  });

  it('reports a missing source object', () => {
    const document = structuredClone(ACME_SEMANTIC_MODEL);
    document.datasets[0]!.source.object = 'missing';
    expect(expectIssues(document)[0]).toMatch(/not in the current metadata/i);
  });

  it('reports an unknown dimension column', () => {
    const document = structuredClone(ACME_SEMANTIC_MODEL);
    document.datasets[2]!.dimensions[0]!.column = 'missing';
    expect(
      expectIssues(document).some((issue) => issue.includes('does not exist')),
    ).toBe(true);
  });

  it('reports an unknown metric expression column', () => {
    const document = structuredClone(ACME_SEMANTIC_MODEL);
    document.datasets[3]!.metrics[0]!.expression = 'quantity * missing';
    expect(
      expectIssues(document).some((issue) =>
        issue.includes('unknown column "missing"'),
      ),
    ).toBe(true);
  });

  it('rejects SUM over a non-numeric expression', () => {
    const document = structuredClone(ACME_SEMANTIC_MODEL);
    document.datasets[2]!.metrics[1]!.expression = 'email';
    expect(
      expectIssues(document).some((issue) =>
        issue.includes('needs numeric columns'),
      ),
    ).toBe(true);
  });

  it('requires joins to follow the FK child -> parent direction', () => {
    const document = structuredClone(ACME_SEMANTIC_MODEL);
    document.joins[0] = {
      name: 'employees_department',
      from: { dataset: 'departments', column: 'id' },
      to: { dataset: 'employees', column: 'department_id' },
      type: 'left',
    };
    expect(
      expectIssues(document).some((issue) =>
        issue.includes('does not match a discovered foreign key'),
      ),
    ).toBe(true);
  });

  it('rejects composite foreign keys', () => {
    const metadata = structuredClone(acmeMetadata);
    metadata.relations.push({
      id: 'relation-composite',
      name: 'employees_department_id_fkey',
      from: { schema: 'hr', object: 'employees', column: 'manager_id' },
      to: { schema: 'hr', object: 'departments', column: 'id' },
    });

    expect(
      expectIssues(ACME_SEMANTIC_MODEL, metadata).some((issue) =>
        issue.includes('composite foreign key'),
      ),
    ).toBe(true);
  });

  it('reports a metric filter whose dimension is unreachable', () => {
    const document = structuredClone(ACME_SEMANTIC_MODEL);
    document.joins = document.joins.filter(
      (join) => join.name !== 'order_items_order',
    );
    expect(
      expectIssues(document).some((issue) =>
        issue.includes('not reachable from "order_items"'),
      ),
    ).toBe(true);
  });

  it('rejects a self-join in the document schema', () => {
    const document = structuredClone(ACME_SEMANTIC_MODEL);
    document.joins[0] = {
      name: 'employees_manager',
      from: { dataset: 'employees', column: 'manager_id' },
      to: { dataset: 'employees', column: 'id' },
      type: 'left',
    };
    const result = semanticModelDocumentSchema.safeParse(document);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('Self-joins'),
        ),
      ).toBe(true);
    }
  });

  it('rejects duplicate metric/dimension names and missing metrics', () => {
    const duplicate = structuredClone(ACME_SEMANTIC_MODEL);
    duplicate.datasets[1]!.metrics[0]!.name = 'headcount';
    const duplicateResult = semanticModelDocumentSchema.safeParse(duplicate);
    expect(duplicateResult.success).toBe(false);

    const empty = structuredClone(ACME_SEMANTIC_MODEL);
    empty.datasets.forEach((dataset) => {
      dataset.metrics = [];
    });
    const emptyResult = semanticModelDocumentSchema.safeParse(empty);
    expect(emptyResult.success).toBe(false);
  });

  it('rejects reserved SQL words as semantic names', () => {
    const document = structuredClone(ACME_SEMANTIC_MODEL);
    document.datasets[2]!.metrics[0]!.name = 'update';
    const result = semanticModelDocumentSchema.safeParse(document);
    expect(result.success).toBe(false);
  });
});
