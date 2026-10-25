import { z } from 'zod';
import type { QueryParameters } from '../query/parameters.js';
import { typeFamily, type TypeFamily } from './type-family.js';

/** Closed set of filter operators shared by QuerySpec and metric definitions. */
export const FILTER_OPERATORS = [
  'eq',
  'neq',
  'in',
  'not_in',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'is_null',
  'is_not_null',
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/** Scalars a JSON filter can carry. Null is expressed with is_null. */
export type FilterScalar = string | number | boolean;
export type FilterValue = FilterScalar | FilterScalar[];

export const filterScalarSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
]);

export const filterValueSchema = z.union([
  filterScalarSchema,
  z.array(filterScalarSchema).min(1).max(100),
]);

/**
 * One filter condition. `value` is optional only for the two null operators;
 * value/operator compatibility is checked once the dimension's type is known.
 */
export const semanticFilterSchema = z
  .object({
    dimension: z.string().min(1).max(64),
    operator: z.enum(FILTER_OPERATORS),
    value: filterValueSchema.optional(),
  })
  .strict();

export type SemanticFilter = z.infer<typeof semanticFilterSchema>;

/** The minimum a dimension needs to expose for filter validation. */
export interface FilterDimension {
  name: string;
  dataType: string;
}

export interface ValidatedFilter<D extends FilterDimension = FilterDimension> {
  dimension: D;
  operator: FilterOperator;
  value?: FilterValue;
  family: TypeFamily;
}

export class SemanticFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SemanticFilterError';
  }
}

const NUMERIC_STRING = /^-?\d+(\.\d+)?$/;
const DATE_STRING = /^\d{4}-\d{2}-\d{2}$/;
const TIME_STRING = /^\d{2}:\d{2}(:\d{2})?$/;
const UUID_STRING =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateScalar(
  value: unknown,
  family: TypeFamily,
  dimension: FilterDimension,
): FilterScalar {
  const where = `Filter on "${dimension.name}"`;

  if (family === 'other') {
    throw new SemanticFilterError(
      `${where} is not supported: type "${dimension.dataType}" has no v0 filter mapping.`,
    );
  }

  if (family === 'numeric') {
    if (
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && NUMERIC_STRING.test(value))
    ) {
      return value;
    }
    throw new SemanticFilterError(
      `${where} expects a numeric value (number or numeric string).`,
    );
  }

  if (family === 'text') {
    if (typeof value === 'string') return value;
    throw new SemanticFilterError(`${where} expects a text value.`);
  }

  if (family === 'boolean') {
    if (typeof value === 'boolean') return value;
    throw new SemanticFilterError(`${where} expects true or false.`);
  }

  if (family === 'date') {
    if (
      typeof value === 'string' &&
      DATE_STRING.test(value) &&
      !Number.isNaN(Date.parse(value))
    ) {
      return value;
    }
    throw new SemanticFilterError(
      `${where} expects a date string in YYYY-MM-DD form.`,
    );
  }

  if (family === 'timestamp' || family === 'timestamptz') {
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
      return value;
    }
    throw new SemanticFilterError(
      `${where} expects an ISO 8601 timestamp string.`,
    );
  }

  if (family === 'time') {
    if (typeof value === 'string' && TIME_STRING.test(value)) return value;
    throw new SemanticFilterError(
      `${where} expects a time string in HH:MM or HH:MM:SS form.`,
    );
  }

  // uuid
  if (typeof value === 'string' && UUID_STRING.test(value)) return value;
  throw new SemanticFilterError(`${where} expects a UUID string.`);
}

/**
 * Checks an operator/value pair against the dimension's type.
 *
 * Returns a normalized filter the compiler can render; the original value is
 * preserved (a numeric string stays a string so bigints do not lose precision).
 */
export function validateSemanticFilter<D extends FilterDimension>(
  filter: SemanticFilter,
  dimension: D,
): ValidatedFilter<D> {
  const family = typeFamily(dimension.dataType);
  const operator = filter.operator;

  if (operator === 'is_null' || operator === 'is_not_null') {
    if (filter.value !== undefined) {
      throw new SemanticFilterError(
        `Filter on "${dimension.name}": operator "${operator}" does not take a value.`,
      );
    }
    return { dimension, operator, family };
  }

  if (operator === 'in' || operator === 'not_in') {
    if (!Array.isArray(filter.value) || filter.value.length === 0) {
      throw new SemanticFilterError(
        `Filter on "${dimension.name}": operator "${operator}" expects a non-empty array.`,
      );
    }
    return {
      dimension,
      operator,
      family,
      value: filter.value.map((entry) =>
        validateScalar(entry, family, dimension),
      ),
    };
  }

  if (operator === 'between') {
    if (!Array.isArray(filter.value) || filter.value.length !== 2) {
      throw new SemanticFilterError(
        `Filter on "${dimension.name}": operator "between" expects exactly two values.`,
      );
    }
    return {
      dimension,
      operator,
      family,
      value: filter.value.map((entry) =>
        validateScalar(entry, family, dimension),
      ) as [FilterScalar, FilterScalar],
    };
  }

  if (Array.isArray(filter.value) || filter.value === undefined) {
    throw new SemanticFilterError(
      `Filter on "${dimension.name}": operator "${operator}" expects one value.`,
    );
  }

  return {
    dimension,
    operator,
    family,
    value: validateScalar(filter.value, family, dimension),
  };
}

const CAST_BY_FAMILY: Record<Exclude<TypeFamily, 'other'>, string> = {
  numeric: 'numeric',
  text: 'text',
  boolean: 'boolean',
  date: 'date',
  timestamp: 'timestamp',
  timestamptz: 'timestamptz',
  time: 'time',
  uuid: 'uuid',
};

function castForFamily(family: TypeFamily): string {
  if (family === 'other') {
    throw new SemanticFilterError('This filter type cannot be compiled in v0.');
  }
  return CAST_BY_FAMILY[family];
}

/**
 * Compiles one validated filter into a parameterized condition.
 *
 * `column` is already a quoted qualified expression (`t1."status"`), and every
 * value goes through the parameter collector — never into the SQL text.
 */
export function compileFilter(
  filter: ValidatedFilter,
  column: string,
  parameters: QueryParameters,
): string {
  const placeholder = (value: FilterScalar): string =>
    `${parameters.add(value)}::${castForFamily(filter.family)}`;

  const value = filter.value;

  switch (filter.operator) {
    case 'eq':
      return `${column} = ${placeholder(value as FilterScalar)}`;
    case 'neq':
      return `${column} <> ${placeholder(value as FilterScalar)}`;
    case 'gt':
      return `${column} > ${placeholder(value as FilterScalar)}`;
    case 'gte':
      return `${column} >= ${placeholder(value as FilterScalar)}`;
    case 'lt':
      return `${column} < ${placeholder(value as FilterScalar)}`;
    case 'lte':
      return `${column} <= ${placeholder(value as FilterScalar)}`;
    case 'in': {
      const list = (value as FilterScalar[]).map(placeholder).join(', ');
      return `${column} IN (${list})`;
    }
    case 'not_in': {
      const list = (value as FilterScalar[]).map(placeholder).join(', ');
      return `${column} NOT IN (${list})`;
    }
    case 'between': {
      const [from, to] = value as [FilterScalar, FilterScalar];
      return `${column} BETWEEN ${placeholder(from)} AND ${placeholder(to)}`;
    }
    case 'is_null':
      return `${column} IS NULL`;
    case 'is_not_null':
      return `${column} IS NOT NULL`;
  }
}
