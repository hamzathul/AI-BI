/** Hard caps for one QuerySpec execution (D51). */
export const QUERY_MAX_ROWS = 10_000;
export const QUERY_TIMEOUT_MS = 15_000;
export const DEFAULT_QUERY_LIMIT = 1_000;

/**
 * Shape limits. The ai-service advertises these in the internal context so the
 * model drafts specs the compiler will accept on the first try (D60).
 */
export const QUERY_MAX_METRICS = 20;
export const QUERY_MAX_DIMENSIONS = 20;
export const QUERY_MAX_FILTERS = 20;
export const QUERY_MAX_ORDER_BY = 10;
