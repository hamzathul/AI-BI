import { ConnectorError, ConnectorErrorCode } from '../connector.errors.js';

/**
 * Maps Postgres SQLSTATE and Node network codes onto our small taxonomy (D36).
 *
 * The goal is not to be exhaustive — it is to make the failures an operator
 * will actually hit (bad password, missing database, no privilege, timeout,
 * unreachable host) classify consistently at the API edge (D38/D39).
 */
const CODE_MAP: Readonly<Record<string, ConnectorErrorCode>> = {
  // Authentication / authorization.
  '28P01': ConnectorErrorCode.AUTH, // invalid_password
  '28000': ConnectorErrorCode.AUTH, // invalid_authorization_specification

  // Connection failures (SQLSTATE class 08 + cannot_connect_now + too_many_connections).
  '08000': ConnectorErrorCode.CONNECTION,
  '08001': ConnectorErrorCode.CONNECTION,
  '08003': ConnectorErrorCode.CONNECTION,
  '08004': ConnectorErrorCode.CONNECTION,
  '08006': ConnectorErrorCode.CONNECTION,
  '57P03': ConnectorErrorCode.CONNECTION,
  '53300': ConnectorErrorCode.CONNECTION,

  // Missing database / schema / object / column.
  '3D000': ConnectorErrorCode.NOT_FOUND, // invalid_catalog_name
  '3F000': ConnectorErrorCode.NOT_FOUND, // invalid_schema_name
  '42P01': ConnectorErrorCode.NOT_FOUND, // undefined_table
  '42703': ConnectorErrorCode.NOT_FOUND, // undefined_column

  // Privileges, syntax, timeouts.
  '42501': ConnectorErrorCode.PERMISSION, // insufficient_privilege
  '42601': ConnectorErrorCode.SYNTAX, // syntax_error
  '57014': ConnectorErrorCode.TIMEOUT, // query_canceled (statement_timeout / pg_cancel_backend)

  // Node network errors.
  ECONNREFUSED: ConnectorErrorCode.CONNECTION,
  ECONNRESET: ConnectorErrorCode.CONNECTION,
  ENOTFOUND: ConnectorErrorCode.CONNECTION,
  EAI_AGAIN: ConnectorErrorCode.CONNECTION,
  EHOSTUNREACH: ConnectorErrorCode.CONNECTION,
  ENETUNREACH: ConnectorErrorCode.CONNECTION,
  EPIPE: ConnectorErrorCode.CONNECTION,
  ETIMEDOUT: ConnectorErrorCode.TIMEOUT,
};

const TLS_CODE_PREFIXES = ['ERR_TLS_', 'CERT_'];

const TLS_CODES = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
]);

const MESSAGES: Readonly<Record<ConnectorErrorCode, string>> = {
  CONNECTION: 'Could not connect to the source database.',
  AUTH: 'Source database credentials were rejected.',
  PERMISSION:
    'The source database role does not have permission for this operation.',
  NOT_FOUND:
    'The requested database object was not found in the source database.',
  SYNTAX: 'The source database rejected the SQL statement.',
  TIMEOUT: 'The source database query was canceled or timed out.',
  UNSUPPORTED: 'The source connector does not support this operation.',
  INTERNAL: 'The source database request failed.',
};

/** Safe, normalized message for a code (never contains driver details). */
export function connectorErrorMessage(code: ConnectorErrorCode): string {
  return MESSAGES[code];
}

function readString(error: unknown, key: string): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;

  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function isTlsFailure(code: string): boolean {
  return (
    TLS_CODES.has(code) ||
    TLS_CODE_PREFIXES.some((prefix) => code.startsWith(prefix))
  );
}

/**
 * Converts anything thrown by `pg` into a `ConnectorError`.
 *
 * Already-normalized errors pass through unchanged, so helpers can throw
 * `ConnectorError` directly without being wrapped twice.
 */
export function mapPostgresError(error: unknown): ConnectorError {
  if (error instanceof ConnectorError) return error;

  const code = readString(error, 'code');

  if (code) {
    if (isTlsFailure(code)) {
      return new ConnectorError(
        ConnectorErrorCode.CONNECTION,
        connectorErrorMessage(ConnectorErrorCode.CONNECTION),
        { cause: error },
      );
    }

    const mapped = CODE_MAP[code];
    if (mapped) {
      return new ConnectorError(mapped, connectorErrorMessage(mapped), {
        cause: error,
      });
    }
  }

  // `pg`'s pool reports its connection timeout as a plain Error without a code.
  const message = readString(error, 'message') ?? '';
  if (/timeout/i.test(message)) {
    return new ConnectorError(
      ConnectorErrorCode.TIMEOUT,
      connectorErrorMessage(ConnectorErrorCode.TIMEOUT),
      { cause: error },
    );
  }

  return new ConnectorError(
    ConnectorErrorCode.INTERNAL,
    connectorErrorMessage(ConnectorErrorCode.INTERNAL),
    { cause: error },
  );
}
