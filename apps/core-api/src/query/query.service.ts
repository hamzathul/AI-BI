import { Injectable } from '@nestjs/common';
import { SourceConnectorService } from '../connectors/source-connector.service.js';
import type { QueryResult } from '../connectors/connector.types.js';
import { assertSafeSelect } from './sql-guard.js';

export const QUERY_MAX_ROWS = 10_000;
export const QUERY_TIMEOUT_MS = 15_000;

@Injectable()
export class QueryService {
  constructor(private readonly sourceConnector: SourceConnectorService) {}

  async execute(sql: string, signal?: AbortSignal): Promise<QueryResult> {
    // Guard first: a rejected statement must never reach the connector.
    const safeSql = assertSafeSelect(sql);

    return this.sourceConnector.getConnector().executeQuery({
      sql: safeSql,
      maxRows: QUERY_MAX_ROWS,
      timeoutMs: QUERY_TIMEOUT_MS,
      signal,
    });
  }
}
