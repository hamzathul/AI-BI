import { canonicalType } from './postgres.types.js';

describe('canonicalType', () => {
  it.each([
    ['integer', 'integer'],
    ['bigint', 'bigint'],
    ['smallint', 'smallint'],
    ['numeric(10,2)', 'numeric(10,2)'],
    ['text', 'text'],
    ['boolean', 'boolean'],
    ['date', 'date'],
    ['uuid', 'uuid'],
    ['jsonb', 'jsonb'],
    ['double precision', 'double precision'],
    ['character varying(50)', 'varchar(50)'],
    ['character varying', 'varchar'],
    ['character(2)', 'char(2)'],
    ['timestamp with time zone', 'timestamptz'],
    ['timestamp without time zone', 'timestamp'],
    ['time with time zone', 'timetz'],
    ['time without time zone', 'time'],
    ['integer[]', 'integer[]'],
    ['numeric(10,2)[]', 'numeric(10,2)[]'],
    ['character varying(50)[]', 'varchar(50)[]'],
    ['timestamp with time zone[]', 'timestamptz[]'],
    ['hr.employee_status', 'hr.employee_status'],
    ['public."Weird Type"', 'public."Weird Type"'],
  ])('maps %s to %s', (input, expected) => {
    expect(canonicalType(input)).toBe(expected);
  });
});
