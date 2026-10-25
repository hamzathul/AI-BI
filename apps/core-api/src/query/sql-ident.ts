/**
 * Quote one SQL identifier.
 *
 * Every identifier that reaches the compiler comes from the metadata snapshot
 * or from a validated semantic name, but we still quote defensively. Doubling
 * embedded quotes is the Postgres rule.
 */
export function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
