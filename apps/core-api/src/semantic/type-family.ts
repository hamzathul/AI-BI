/**
 * Coarse type families used by semantic filters and metric validation.
 *
 * The connector stores canonical Postgres type names (D40). This module maps
 * them to the few families the compiler knows how to cast and compare.
 */
export type TypeFamily =
  | 'numeric'
  | 'text'
  | 'boolean'
  | 'date'
  | 'timestamp'
  | 'timestamptz'
  | 'time'
  | 'uuid'
  | 'other';

const NUMERIC_TYPES = new Set([
  'smallint',
  'integer',
  'bigint',
  'int2',
  'int4',
  'int8',
  'decimal',
  'numeric',
  'real',
  'double precision',
  'float4',
  'float8',
]);

const TEXT_TYPES = new Set([
  'text',
  'varchar',
  'character varying',
  'char',
  'character',
  'citext',
  'name',
]);

export function typeFamily(dataType: string): TypeFamily {
  const normalized = dataType.toLowerCase().trim();

  if (normalized.endsWith('[]')) return 'other';

  if (
    normalized === 'timestamptz' ||
    (normalized.startsWith('timestamp') &&
      normalized.includes('with time zone'))
  ) {
    return 'timestamptz';
  }

  if (normalized === 'timestamp' || normalized.startsWith('timestamp')) {
    return 'timestamp';
  }

  if (normalized === 'date') return 'date';

  if (normalized === 'time' || normalized.startsWith('time(')) return 'time';

  if (normalized === 'boolean' || normalized === 'bool') return 'boolean';

  if (normalized === 'uuid') return 'uuid';

  const base = normalized.split('(')[0]?.trim() ?? normalized;

  if (TEXT_TYPES.has(base)) return 'text';
  if (NUMERIC_TYPES.has(base)) return 'numeric';

  return 'other';
}
