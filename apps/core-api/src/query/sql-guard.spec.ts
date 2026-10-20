import { BadRequestException } from '@nestjs/common';
import { MAX_SQL_LENGTH, assertSafeSelect } from './sql-guard.js';

function rejection(sql: string): BadRequestException {
  try {
    assertSafeSelect(sql);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return error as BadRequestException;
  }

  throw new Error(`Expected SQL to be rejected: ${sql}`);
}

describe('assertSafeSelect', () => {
  it.each([
    'SELECT 1',
    '  select * from hr.employees  ',
    'WITH x AS (SELECT 1 AS n) SELECT n FROM x',
    "SELECT 'hello' AS label",
    'SELECT g FROM generate_series(1, 10) AS g',
  ])('accepts %s', (sql) => {
    expect(assertSafeSelect(sql)).toBe(sql.trim());
  });

  it.each([[''], ['   ']])('rejects empty SQL', (sql) => {
    expect(rejection(sql).message).toContain('must not be empty');
  });

  it.each([
    'SELECT 1;',
    'SELECT 1; DROP TABLE hr.employees',
    "SELECT * FROM hr.employees WHERE note = 'a;b'",
  ])('rejects statement separators', (sql) => {
    expect(rejection(sql).message).toContain('Only one statement');
  });

  it.each([
    'SELECT 1 -- trailing comment',
    '/* leading */ SELECT 1',
    "SELECT * FROM hr.employees WHERE note = 'a--b'",
  ])('rejects comments', (sql) => {
    expect(rejection(sql).message).toContain('comments are not allowed');
  });

  it.each([
    'UPDATE hr.employees SET salary = 0',
    'TABLE hr.employees',
    'VALUES (1)',
    'DELETE FROM hr.employees',
    'EXPLAIN SELECT 1',
  ])('rejects non-SELECT statements', (sql) => {
    expect(rejection(sql).message).toBe('Only SELECT statements are allowed.');
  });

  it.each([
    'WITH x AS (DELETE FROM hr.employees RETURNING *) SELECT * FROM x',
    'WITH x AS (UPDATE hr.employees SET salary = 0 RETURNING *) SELECT * FROM x',
    'SELECT * INTO backup FROM hr.employees',
    'SELECT * FROM hr.employees FOR UPDATE',
    'SELECT "update" FROM hr.employees',
  ])('rejects write/DDL keywords', (sql) => {
    expect(rejection(sql).message).toContain('forbidden keyword');
  });

  it.each([
    'SELECT pg_sleep(5)',
    "SELECT pg_catalog.pg_read_file('/etc/passwd')",
    "SELECT set_config('statement_timeout', '0', false)",
    'SELECT pg_terminate_backend(123)',
    'SELECT pg_advisory_lock(1)',
    'SELECT pg_try_advisory_xact_lock_shared(1)',
    "SELECT query_to_xml('SELECT 1', true, false, '')",
  ])('rejects dangerous functions', (sql) => {
    expect(rejection(sql).message).toContain('forbidden function');
  });

  it('rejects SQL longer than the limit', () => {
    const sql = `SELECT '${'x'.repeat(MAX_SQL_LENGTH)}'`;

    expect(rejection(sql).message).toContain(
      `at most ${MAX_SQL_LENGTH} characters`,
    );
  });
});
