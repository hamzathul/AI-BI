/**
 * Normalized connector failures (D36).
 *
 * Drivers throw wildly different errors (pg codes, network errno values, TLS
 * failures). Connectors translate them into this small set, so callers and the
 * HTTP layer never branch on driver details.
 *
 * Messages must be safe for logs and clients: never embed credentials or the
 * connection string. Raw driver errors belong in `cause`, which stays
 * server-side.
 */

export const ConnectorErrorCode = {
  /** Unreachable server: DNS, refused connection, TLS. */
  CONNECTION: 'CONNECTION',
  /** Credentials rejected. */
  AUTH: 'AUTH',
  /** Authenticated, but the role lacks the required privilege. */
  PERMISSION: 'PERMISSION',
  /** Missing schema, object, or column. */
  NOT_FOUND: 'NOT_FOUND',
  /** Invalid SQL. */
  SYNTAX: 'SYNTAX',
  /** Statement or connection timeout. */
  TIMEOUT: 'TIMEOUT',
  /** The connector (or registry kind) cannot do this. */
  UNSUPPORTED: 'UNSUPPORTED',
  /** Unexpected, unclassified failure. */
  INTERNAL: 'INTERNAL',
} as const;

export type ConnectorErrorCode =
  (typeof ConnectorErrorCode)[keyof typeof ConnectorErrorCode];

export class ConnectorError extends Error {
  constructor(
    readonly code: ConnectorErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ConnectorError';
  }
}
