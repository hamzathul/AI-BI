import { ConnectorError, ConnectorErrorCode } from './connector.errors.js';
import { ConnectorRegistry } from './connector.registry.js';
import type {
  ConnectorKind,
  ConnectorManifest,
  SourceConnector,
} from './connector.types.js';

function makeConnector(
  overrides: Partial<ConnectorManifest> = {},
): SourceConnector {
  return {
    manifest: {
      kind: 'postgres',
      displayName: 'PostgreSQL',
      capabilities: { schemas: true, views: true },
      ...overrides,
    },
    testConnection: vi.fn(),
    discoverSchema: vi.fn(),
    executeQuery: vi.fn(),
  };
}

describe('ConnectorRegistry', () => {
  it('registers and retrieves a connector by kind', () => {
    const registry = new ConnectorRegistry();
    const connector = makeConnector();

    registry.register(connector);

    expect(registry.get('postgres')).toBe(connector);
  });

  it('lists the manifests of every registered connector', () => {
    const registry = new ConnectorRegistry();
    const connector = makeConnector();

    registry.register(connector);

    expect(registry.list()).toEqual([connector.manifest]);
  });

  it('rejects a duplicate kind as a programming error', () => {
    const registry = new ConnectorRegistry();
    registry.register(makeConnector());

    expect(() => registry.register(makeConnector())).toThrow(
      'Connector "postgres" is already registered.',
    );
  });

  it('throws a normalized UNSUPPORTED error for an unknown kind', () => {
    const registry = new ConnectorRegistry();
    // A kind that exists at runtime (e.g. from config) but has no connector yet.
    const unknownKind = 'mysql' as ConnectorKind;

    let caught: unknown;
    try {
      registry.get(unknownKind);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ConnectorError);
    expect(caught).toMatchObject({ code: ConnectorErrorCode.UNSUPPORTED });
  });
});
