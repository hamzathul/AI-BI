import { BadRequestException } from '@nestjs/common';
import { SourceConnectorService } from '../connectors/source-connector.service.js';
import {
  QUERY_MAX_ROWS,
  QUERY_TIMEOUT_MS,
  QueryService,
} from './query.service.js';

describe('QueryService', () => {
  const connector = { executeQuery: vi.fn() };
  const sourceConnector = { getConnector: vi.fn(() => connector) };
  let service: QueryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new QueryService(
      sourceConnector as unknown as SourceConnectorService,
    );
  });

  it('guards the SQL and passes the execution limits to the connector', async () => {
    const result = {
      columns: [{ name: 'count', dataType: 'integer' }],
      rows: [{ count: 39 }],
      rowCount: 1,
      truncated: false,
      durationMs: 5,
    };
    connector.executeQuery.mockResolvedValue(result);
    const abort = new AbortController();

    await expect(
      service.execute(
        '  SELECT count(*)::int AS count FROM hr.employees  ',
        abort.signal,
      ),
    ).resolves.toBe(result);

    expect(connector.executeQuery).toHaveBeenCalledWith({
      sql: 'SELECT count(*)::int AS count FROM hr.employees',
      maxRows: QUERY_MAX_ROWS,
      timeoutMs: QUERY_TIMEOUT_MS,
      signal: abort.signal,
    });
  });

  it('rejects unsafe SQL before touching the source', async () => {
    await expect(
      service.execute('DELETE FROM hr.employees'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(sourceConnector.getConnector).not.toHaveBeenCalled();
    expect(connector.executeQuery).not.toHaveBeenCalled();
  });
});
