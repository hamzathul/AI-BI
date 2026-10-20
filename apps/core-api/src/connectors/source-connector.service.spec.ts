import { ConfigService } from '@nestjs/config';
import { ConnectorError, ConnectorErrorCode } from './connector.errors.js';
import { ConnectorRegistry } from './connector.registry.js';
import {
  SourceConnectorService,
  connectorKindFromUrl,
} from './source-connector.service.js';
import type { SourceConnector } from './connector.types.js';

describe('connectorKindFromUrl', () => {
  it.each([
    ['postgresql://user:pw@localhost:5433/acme', 'postgres'],
    ['postgres://user:pw@localhost:5433/acme', 'postgres'],
    ['mysql://user:pw@localhost:3306/acme', null],
    ['not a url', null],
  ])('maps %s to %s', (url, expected) => {
    expect(connectorKindFromUrl(url)).toBe(expected);
  });
});

describe('SourceConnectorService', () => {
  const connector = { manifest: { kind: 'postgres' } } as SourceConnector;
  const config = { getOrThrow: vi.fn() };
  const registry = { get: vi.fn() };
  let service: SourceConnectorService;

  beforeEach(() => {
    vi.clearAllMocks();
    config.getOrThrow.mockReturnValue(
      'postgresql://acme_reader:pw@localhost:5433/acme',
    );
    registry.get.mockReturnValue(connector);
    service = new SourceConnectorService(
      config as unknown as ConfigService,
      registry as unknown as ConnectorRegistry,
    );
  });

  it('resolves the configured postgres source through the registry', () => {
    expect(service.getConnector()).toBe(connector);
    expect(config.getOrThrow).toHaveBeenCalledWith('SOURCE_DATABASE_URL');
    expect(registry.get).toHaveBeenCalledWith('postgres');
  });

  it('throws UNSUPPORTED for a non-Postgres scheme before touching the registry', () => {
    config.getOrThrow.mockReturnValue('mysql://user:pw@localhost/acme');

    let caught: unknown;
    try {
      service.getConnector();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ConnectorError);
    expect(caught).toMatchObject({ code: ConnectorErrorCode.UNSUPPORTED });
    expect(registry.get).not.toHaveBeenCalled();
  });
});
