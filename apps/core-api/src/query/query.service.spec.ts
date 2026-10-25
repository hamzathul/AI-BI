import { BadRequestException } from '@nestjs/common';
import { SourceConnectorService } from '../connectors/source-connector.service.js';
import { acmeMetadata } from '../../test/fixtures/acme-metadata.js';
import { ACME_SEMANTIC_MODEL } from '../semantic/acme-model.js';
import { semanticModelDocumentSchema } from '../semantic/semantic-model.schema.js';
import { buildSemanticCatalog } from '../semantic/semantic-model.validation.js';
import type { SemanticCatalog } from '../semantic/semantic-catalog.js';
import { SemanticService } from '../semantic/semantic.service.js';
import { QUERY_MAX_ROWS, QUERY_TIMEOUT_MS } from './query.constants.js';
import { QueryService } from './query.service.js';
import { querySpecSchema } from './query-spec.schema.js';

const acmeCatalog = buildSemanticCatalog(
  semanticModelDocumentSchema.parse(ACME_SEMANTIC_MODEL),
  acmeMetadata,
  { modelId: 'model-1' },
);

describe('QueryService', () => {
  const connector = { executeQuery: vi.fn() };
  const sourceConnector = { getConnector: vi.fn(() => connector) };
  const getCatalog = vi.fn();
  const semanticService = { getCatalog };
  let service: QueryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new QueryService(
      sourceConnector as unknown as SourceConnectorService,
      semanticService as unknown as SemanticService,
    );
  });

  function context(catalog: SemanticCatalog = acmeCatalog) {
    getCatalog.mockResolvedValue({
      catalog,
      modelId: 'model-1',
      modelName: 'Acme Inc.',
    });
  }

  it('compiles, guards, and executes a QuerySpec', async () => {
    context();
    const result = {
      columns: [
        { name: 'department', dataType: 'text' },
        { name: 'headcount', dataType: 'bigint' },
      ],
      rows: [{ department: 'Engineering', headcount: '11' }],
      rowCount: 1,
      truncated: false,
      durationMs: 5,
    };
    connector.executeQuery.mockResolvedValue(result);
    const abort = new AbortController();

    const response = await service.executeSpec(
      querySpecSchema.parse({
        metrics: ['headcount'],
        dimensions: ['department'],
        limit: 100,
      }),
      abort.signal,
    );

    expect(connector.executeQuery).toHaveBeenCalledWith({
      sql: expect.stringContaining('FROM "hr"."employees" AS t0'),
      parameters: [true, 100],
      maxRows: QUERY_MAX_ROWS,
      timeoutMs: QUERY_TIMEOUT_MS,
      signal: abort.signal,
    });
    expect(response).toMatchObject({
      ...result,
      meta: {
        modelId: 'model-1',
        modelName: 'Acme Inc.',
        dataset: 'employees',
        limit: 100,
      },
    });
    expect(response.meta.compiledSql).toContain(
      'LEFT JOIN "hr"."departments" AS t1',
    );
  });

  it('rejects a query when no semantic model is saved', async () => {
    getCatalog.mockResolvedValue(null);

    await expect(
      service.executeSpec(querySpecSchema.parse({ metrics: ['headcount'] })),
    ).rejects.toThrow(/No semantic model is saved/);

    expect(sourceConnector.getConnector).not.toHaveBeenCalled();
  });

  it('rejects a spec that cannot be compiled before touching the source', async () => {
    context();

    await expect(
      service.executeSpec(
        querySpecSchema.parse({
          metrics: ['headcount', 'revenue'],
        }),
      ),
    ).rejects.toThrow(BadRequestException);

    expect(sourceConnector.getConnector).not.toHaveBeenCalled();
  });

  it('keeps the SQL guard as a second line of defense', async () => {
    const fakeCatalog: SemanticCatalog = {
      model: { name: 'unsafe' },
      datasets: new Map([
        [
          'thing',
          {
            name: 'thing',
            schemaName: 'public',
            objectName: 'set',
            columns: new Map(),
            dimensions: new Map(),
            metrics: new Map(),
          },
        ],
      ]),
      dimensions: new Map(),
      metrics: new Map([
        [
          'things',
          {
            name: 'things',
            dataset: 'thing',
            aggregation: 'count',
            expression: null,
            filters: [],
          },
        ],
      ]),
      joins: [],
    };
    context(fakeCatalog);

    await expect(
      service.executeSpec(querySpecSchema.parse({ metrics: ['things'] })),
    ).rejects.toThrow(/forbidden keyword/i);

    expect(sourceConnector.getConnector).not.toHaveBeenCalled();
  });
});
