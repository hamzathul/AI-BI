/**
 * Coarse type families for display and date detection.
 *
 * Mirrors the server's canonical Postgres type names (D40). The server remains
 * the source of truth for validation; this copy only decides labels and which
 * dimensions can take a date grain.
 */
const NUMERIC_TYPES = new Set([
  "smallint",
  "integer",
  "bigint",
  "int2",
  "int4",
  "int8",
  "decimal",
  "numeric",
  "real",
  "double precision",
  "float4",
  "float8",
]);

export function isNumericType(dataType: string): boolean {
  const base = dataType.toLowerCase().trim().split("(")[0]?.trim() ?? "";
  return NUMERIC_TYPES.has(base);
}

export function isDateType(dataType: string): boolean {
  const normalized = dataType.toLowerCase().trim();
  return (
    normalized === "date" ||
    normalized === "timestamptz" ||
    normalized.startsWith("timestamp")
  );
}
