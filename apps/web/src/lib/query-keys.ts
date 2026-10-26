/** One place for cache keys, so invalidation cannot drift from fetching. */
export const queryKeys = {
  source: ["source"] as const,
  metadata: ["metadata"] as const,
  semanticModel: ["semantic-model"] as const,
  dashboards: ["dashboards"] as const,
  dashboard: (id: string) => ["dashboards", id] as const,
  chartExecution: (
    charts: unknown,
    filters: unknown,
  ) => ["chart-execution", charts, filters] as const,
};
