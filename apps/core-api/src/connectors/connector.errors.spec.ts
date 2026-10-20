import { ConnectorError, ConnectorErrorCode } from './connector.errors.js';

describe('ConnectorError', () => {
  it('carries a normalized code and keeps the driver cause', () => {
    const cause = new Error('password authentication failed');

    const error = new ConnectorError(
      ConnectorErrorCode.AUTH,
      'Source credentials were rejected.',
      { cause },
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ConnectorError');
    expect(error.code).toBe('AUTH');
    expect(error.message).toBe('Source credentials were rejected.');
    expect(error.cause).toBe(cause);
  });
});
