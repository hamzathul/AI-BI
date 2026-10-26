import { api, callApi } from "./client";
import type {
  ChartExecutionRequest,
  ChartExecutionResponse,
} from "./types";

/**
 * One batch call per canvas refresh: the server merges dashboard filters,
 * compiles, guards, and executes each chart, returning per-chart errors (D55).
 */
export function executeCharts(
  request: ChartExecutionRequest,
): Promise<ChartExecutionResponse> {
  return callApi(() => api.POST("/api/charts/execute", { body: request }));
}
