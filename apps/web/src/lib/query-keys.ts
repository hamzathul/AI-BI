/** One place for cache keys, so invalidation cannot drift from fetching. */
export const queryKeys = {
  source: ["source"] as const,
  metadata: ["metadata"] as const,
};
