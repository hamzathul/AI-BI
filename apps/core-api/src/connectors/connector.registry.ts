import { Injectable } from '@nestjs/common';
import { ConnectorError, ConnectorErrorCode } from './connector.errors.js';
import type {
  ConnectorKind,
  ConnectorManifest,
  SourceConnector,
} from './connector.types.js';

/**
 * The single place connectors are looked up by kind (D36).
 *
 * Today the app has one env-configured source and one connector, so this stays
 * tiny. When a real connector lands in 2.4, its module registers it here and
 * callers keep asking for `get(kind)`.
 */
@Injectable()
export class ConnectorRegistry {
  private readonly connectors = new Map<ConnectorKind, SourceConnector>();

  /**
   * Duplicate kinds are a programming error, not an operational one: they can
   * only happen if two modules register the same connector.
   */
  register(connector: SourceConnector): void {
    const { kind } = connector.manifest;

    if (this.connectors.has(kind)) {
      throw new Error(`Connector "${kind}" is already registered.`);
    }

    this.connectors.set(kind, connector);
  }

  get(kind: ConnectorKind): SourceConnector {
    const connector = this.connectors.get(kind);

    if (!connector) {
      throw new ConnectorError(
        ConnectorErrorCode.UNSUPPORTED,
        `No connector registered for "${kind}".`,
      );
    }

    return connector;
  }

  /** Manifests for status/UI purposes (2.3+); connector instances stay internal. */
  list(): ConnectorManifest[] {
    return [...this.connectors.values()].map((connector) => connector.manifest);
  }
}
