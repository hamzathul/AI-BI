import { BadRequestException, Injectable } from '@nestjs/common';
import { SourceConnectorService } from '../connectors/source-connector.service.js';
import {
  SemanticService,
  type SemanticCatalogContext,
} from '../semantic/semantic.service.js';
import { compileQuery, QueryCompilationError } from './query-compiler.js';
import type { QueryExecutionResultDto } from './query.dto.js';
import { QUERY_MAX_ROWS, QUERY_TIMEOUT_MS } from './query.constants.js';
import type { QuerySpec } from './query-spec.schema.js';
import { assertSafeSelect } from './sql-guard.js';

export { QUERY_MAX_ROWS, QUERY_TIMEOUT_MS };

@Injectable()
export class QueryService {
  constructor(
    private readonly sourceConnector: SourceConnectorService,
    private readonly semanticService: SemanticService,
  ) {}

  /**
   * QuerySpec → compiler → SQL guard → connector (D9/D42/D51).
   *
   * The guard is deliberately a second line of defense: the compiler is
   * responsible for making a safe statement, and the guard rejects anything
   * that still looks like a write, DDL, or session command.
   */
  async executeSpec(
    spec: QuerySpec,
    signal?: AbortSignal,
  ): Promise<QueryExecutionResultDto> {
    const context = await this.semanticService.getCatalog();

    if (!context) {
      throw new BadRequestException(
        'No semantic model is saved. Save one with PUT /api/semantic/model before querying.',
      );
    }

    return this.executeWithCatalog(spec, context, signal);
  }

  /**
   * Same pipeline as `executeSpec`, reusing a catalog the caller already loaded.
   * A chart batch runs several specs against one model (D55).
   */
  async executeWithCatalog(
    spec: QuerySpec,
    context: SemanticCatalogContext,
    signal?: AbortSignal,
  ): Promise<QueryExecutionResultDto> {
    let compiled;

    try {
      compiled = compileQuery(spec, context.catalog);
    } catch (error) {
      if (error instanceof QueryCompilationError) {
        throw new BadRequestException(error.issues);
      }
      throw error;
    }

    // Guard first: a rejected statement must never reach the connector.
    const safeSql = assertSafeSelect(compiled.sql);

    const result = await this.sourceConnector.getConnector().executeQuery({
      sql: safeSql,
      parameters: compiled.parameters,
      maxRows: QUERY_MAX_ROWS,
      timeoutMs: QUERY_TIMEOUT_MS,
      signal,
    });

    return {
      ...result,
      meta: {
        modelId: context.modelId,
        modelName: context.modelName,
        dataset: compiled.dataset,
        limit: compiled.limit,
        compiledSql: safeSql,
      },
    };
  }
}
