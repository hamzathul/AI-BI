import { BadRequestException } from '@nestjs/common';

/** Matches the request schema; kept here so the guard owns the limit. */
export const MAX_SQL_LENGTH = 20_000;

/**
 * Keywords that only appear in write/DDL/session statements (D42).
 *
 * A single-statement SELECT already cannot execute these, but data-modifying
 * CTEs (`WITH x AS (DELETE ...)`) are valid SQL, so the denylist is a second
 * line of defense behind the read-only role and read-only transaction.
 */
const FORBIDDEN_KEYWORDS = [
  'insert',
  'update',
  'delete',
  'drop',
  'alter',
  'create',
  'truncate',
  'grant',
  'revoke',
  'merge',
  'call',
  'do',
  'copy',
  'vacuum',
  'analyze',
  'cluster',
  'reindex',
  'refresh',
  'into',
  'lock',
  'set',
  'reset',
  'begin',
  'commit',
  'rollback',
  'savepoint',
  'release',
  'listen',
  'notify',
  'unlisten',
  'prepare',
  'execute',
  'deallocate',
  'discard',
];

/** Functions with side effects or the ability to stall/cancel other work. */
const FORBIDDEN_FUNCTIONS = [
  'pg_sleep',
  'pg_sleep_for',
  'pg_sleep_until',
  'pg_terminate_backend',
  'pg_cancel_backend',
  'pg_reload_conf',
  'pg_rotate_logfile',
  'pg_read_file',
  'pg_read_binary_file',
  'pg_ls_dir',
  'pg_stat_file',
  'pg_advisory_lock',
  'pg_advisory_lock_shared',
  'pg_advisory_xact_lock',
  'pg_advisory_xact_lock_shared',
  'pg_try_advisory_lock',
  'pg_try_advisory_lock_shared',
  'pg_try_advisory_xact_lock',
  'pg_try_advisory_xact_lock_shared',
  'query_to_xml',
  'query_to_xmlschema',
  'query_to_xml_and_xmlschema',
  'lo_import',
  'lo_export',
  'dblink',
  'dblink_exec',
  'set_config',
];

const FORBIDDEN_KEYWORD_SET = new Set(FORBIDDEN_KEYWORDS);

/**
 * Semantic metric/dimension names become SQL aliases, so the blunt guard would
 * reject a valid model containing a name like `update` only at query time.
 * The semantic layer uses this to reject such names when they are saved.
 */
export function isForbiddenSqlKeyword(value: string): boolean {
  return FORBIDDEN_KEYWORD_SET.has(value.toLowerCase());
}

const KEYWORD_PATTERN = new RegExp(
  `\\b(${FORBIDDEN_KEYWORDS.join('|')})\\b`,
  'i',
);
const FUNCTION_PATTERN = new RegExp(
  `\\b(${FORBIDDEN_FUNCTIONS.join('|')})\\b`,
  'i',
);
const LOCK_PATTERN =
  /\bfor\s+(?:update|share|no\s+key\s+update|key\s+share)\b/i;

/**
 * Validates the SQL that reaches `executeQuery` (D42).
 *
 * Rules: one statement, SELECT/WITH only, no comments, no statement separator,
 * no write/DDL/session keywords, no dangerous functions. The rule is
 * intentionally blunt: a quoted identifier that happens to be a denied keyword
 * is rejected too. For v0 that is the safe side of the trade-off.
 *
 * Throws a 400 `BadRequestException` with a safe, actionable message.
 */
export function assertSafeSelect(sql: string): string {
  const trimmed = sql.trim();

  if (trimmed.length === 0) {
    throw new BadRequestException('SQL must not be empty.');
  }

  if (trimmed.length > MAX_SQL_LENGTH) {
    throw new BadRequestException(
      `SQL must be at most ${MAX_SQL_LENGTH} characters.`,
    );
  }

  if (trimmed.includes(';')) {
    throw new BadRequestException(
      'Only one statement is allowed; remove the semicolon.',
    );
  }

  if (
    trimmed.includes('--') ||
    trimmed.includes('/*') ||
    trimmed.includes('*/')
  ) {
    throw new BadRequestException('SQL comments are not allowed.');
  }

  if (!/^(select|with)\b/i.test(trimmed)) {
    throw new BadRequestException('Only SELECT statements are allowed.');
  }

  const keyword = KEYWORD_PATTERN.exec(trimmed);
  if (keyword) {
    throw new BadRequestException(
      `The SQL contains a forbidden keyword: ${keyword[1].toUpperCase()}.`,
    );
  }

  const fn = FUNCTION_PATTERN.exec(trimmed);
  if (fn) {
    throw new BadRequestException(
      `The SQL uses a forbidden function: ${fn[1]}.`,
    );
  }

  if (LOCK_PATTERN.test(trimmed)) {
    throw new BadRequestException('Row-locking clauses are not allowed.');
  }

  return trimmed;
}
