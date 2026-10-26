import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import {
  applyDashboardFilters,
  DashboardFilterError,
  validateDashboardFilters,
} from '../dashboards/dashboard-filters.js';
import type { DashboardFilters } from '../dashboards/dashboard-filters.schema.js';
import { QueryService } from '../query/query.service.js';
import {
  SemanticService,
  type SemanticCatalogContext,
} from '../semantic/semantic.service.js';
import type {
  ChartExecutionResponseDto,
  ChartExecutionResultItemDto,
} from './chart-execution.dto.js';
import type { ChartSpec } from './chart-spec.schema.js';

/** Small enough for the read-only pool (max 4, D38) to breathe. */
const CONCURRENCY = 3;

function describeExecutionError(error: unknown): {
  message: string;
  code?: string;
} {
  if (error instanceof HttpException) {
    const body = error.getResponse();

    if (typeof body === 'string') return { message: body };

    const record = body as { message?: string | string[]; code?: string };
    const message = Array.isArray(record.message)
      ? record.message.join('; ')
      : (record.message ?? error.message);

    return { message, code: record.code };
  }

  if (error instanceof Error) return { message: error.message };

  return { message: 'The chart could not be executed.' };
}

@Injectable()
export class ChartExecutionService {
  constructor(
    private readonly queryService: QueryService,
    private readonly semanticService: SemanticService,
  ) {}

  /**
   * Executes a batch of charts against the saved semantic model (D55).
   *
   * One failing chart never fails the batch: each item carries its own error so
   * a single broken tile cannot blank a dashboard.
   */
  async execute(
    request: {
      filters?: DashboardFilters;
      charts: Array<{ id: string; chart: ChartSpec }>;
    },
    signal?: AbortSignal,
  ): Promise<ChartExecutionResponseDto> {
    const context = await this.semanticService.getCatalog();

    if (!context) {
      throw new BadRequestException(
        'No semantic model is saved. Save one with PUT /api/semantic/model before querying.',
      );
    }

    if (request.filters) {
      try {
        validateDashboardFilters(request.filters, context.catalog);
      } catch (error) {
        if (error instanceof DashboardFilterError) {
          throw new BadRequestException(error.issues);
        }
        throw error;
      }
    }

    const results: ChartExecutionResultItemDto[] = [];
    let cursor = 0;

    const worker = async () => {
      while (cursor < request.charts.length) {
        const index = cursor++;
        const item = request.charts[index]!;
        results[index] = await this.executeOne(
          item,
          request.filters,
          context,
          signal,
        );
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(CONCURRENCY, request.charts.length) },
        worker,
      ),
    );

    return {
      results,
      warnings: results.flatMap((result) => result.warnings),
    };
  }

  private async executeOne(
    item: { id: string; chart: ChartSpec },
    filters: DashboardFilters | undefined,
    context: SemanticCatalogContext,
    signal?: AbortSignal,
  ): Promise<ChartExecutionResultItemDto> {
    let query = item.chart.query;
    const warnings: string[] = [];
    let filterApplied = false;

    if (filters) {
      try {
        const applied = applyDashboardFilters(query, filters, context.catalog);
        query = applied.query;
        filterApplied = applied.applied.length > 0;

        for (const dimension of applied.skipped) {
          warnings.push(
            `"${item.chart.title}": the dashboard filter on "${dimension}" does not reach this chart's dataset, so it was not applied.`,
          );
        }
      } catch (error) {
        if (error instanceof DashboardFilterError) {
          return {
            id: item.id,
            ok: false,
            filterApplied: false,
            warnings,
            query,
            error: { message: error.message },
          };
        }
        throw error;
      }
    }

    try {
      const result = await this.queryService.executeWithCatalog(
        query,
        context,
        signal,
      );

      return {
        id: item.id,
        ok: true,
        filterApplied,
        warnings,
        query,
        result,
      };
    } catch (error) {
      return {
        id: item.id,
        ok: false,
        filterApplied,
        warnings,
        query,
        error: describeExecutionError(error),
      };
    }
  }
}
