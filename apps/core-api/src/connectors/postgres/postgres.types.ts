/**
 * Canonical type names (D40).
 *
 * Postgres' `format_type()` gives us the full, human-readable spelling:
 * `character varying(50)`, `timestamp with time zone`, `numeric(10,2)`.
 * We shorten the noisy SQL-standard aliases so metadata and query results use
 * one vocabulary, while keeping typmods, arrays, and custom/enum names intact.
 */
const PREFIX_ALIASES: ReadonlyArray<readonly [from: string, to: string]> = [
  ['timestamp with time zone', 'timestamptz'],
  ['timestamp without time zone', 'timestamp'],
  ['time with time zone', 'timetz'],
  ['time without time zone', 'time'],
  // Must come before "character", otherwise it would become "char varying".
  ['character varying', 'varchar'],
  ['character', 'char'],
];

/**
 * `character varying(50)[]` → `varchar(50)[]`
 * `timestamp with time zone` → `timestamptz`
 * `numeric(10,2)` and `hr.employee_status` stay as they are.
 */
export function canonicalType(postgresType: string): string {
  for (const [from, to] of PREFIX_ALIASES) {
    if (postgresType.startsWith(from)) {
      return `${to}${postgresType.slice(from.length)}`;
    }
  }

  return postgresType;
}
