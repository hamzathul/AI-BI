import { ConnectorError, ConnectorErrorCode } from '../connector.errors.js';
import { connectorErrorMessage, mapPostgresError } from './postgres.errors.js';

describe('mapPostgresError', () => {
  it.each([
    ['28P01', ConnectorErrorCode.AUTH],
    ['28000', ConnectorErrorCode.AUTH],
    ['3D000', ConnectorErrorCode.NOT_FOUND],
    ['42P01', ConnectorErrorCode.NOT_FOUND],
    ['42501', ConnectorErrorCode.PERMISSION],
    ['42601', ConnectorErrorCode.SYNTAX],
    ['57014', ConnectorErrorCode.TIMEOUT],
    ['08006', ConnectorErrorCode.CONNECTION],
    ['57P03', ConnectorErrorCode.CONNECTION],
    ['53300', ConnectorErrorCode.CONNECTION],
    ['ECONNREFUSED', ConnectorErrorCode.CONNECTION],
    ['ENOTFOUND', ConnectorErrorCode.CONNECTION],
    ['EAI_AGAIN', ConnectorErrorCode.CONNECTION],
    ['ECONNRESET', ConnectorErrorCode.CONNECTION],
    ['ETIMEDOUT', ConnectorErrorCode.TIMEOUT],
  ])('maps driver code %s to %s', (code, expected) => {
    const raw = Object.assign(new Error('driver detail with host and user'), {
      code,
    });

    const mapped = mapPostgresError(raw);

    expect(mapped).toBeInstanceOf(ConnectorError);
    expect(mapped.code).toBe(expected);
    expect(mapped.message).toBe(connectorErrorMessage(expected));
    expect(mapped.message).not.toContain('driver detail');
    expect(mapped.cause).toBe(raw);
  });

  it.each([
    'SELF_SIGNED_CERT_IN_CHAIN',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'ERR_TLS_CERT_ALTNAME_INVALID',
  ])('treats TLS failure %s as a connection problem', (code) => {
    const mapped = mapPostgresError(Object.assign(new Error('tls'), { code }));

    expect(mapped.code).toBe(ConnectorErrorCode.CONNECTION);
  });

  it('treats a pool timeout message without a code as a timeout', () => {
    const mapped = mapPostgresError(
      new Error('timeout exceeded when trying to connect'),
    );

    expect(mapped.code).toBe(ConnectorErrorCode.TIMEOUT);
  });

  it('passes an already-normalized ConnectorError through unchanged', () => {
    const original = new ConnectorError(
      ConnectorErrorCode.PERMISSION,
      'The source role does not have the required permission.',
    );

    expect(mapPostgresError(original)).toBe(original);
  });

  it('falls back to INTERNAL for unknown failures', () => {
    const mapped = mapPostgresError(new Error('something odd happened'));

    expect(mapped.code).toBe(ConnectorErrorCode.INTERNAL);
    expect(mapped.message).toBe(connectorErrorMessage('INTERNAL'));
    expect(mapped.message).not.toContain('something odd happened');
  });
});
