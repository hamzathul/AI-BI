import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectorError, ConnectorErrorCode } from './connector.errors.js';
import { ConnectorRegistry } from './connector.registry.js';
import type { ConnectorKind, SourceConnector } from './connector.types.js';

/**
 * Maps a connection URL scheme to a registered connector kind.
 *
 * Kept exported so it can be unit-tested without Nest or a real database.
 */
export function connectorKindFromUrl(sourceUrl: string): ConnectorKind | null {
  try {
    const { protocol } = new URL(sourceUrl);

    if (protocol === 'postgres:' || protocol === 'postgresql:') {
      return 'postgres';
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * The one place callers ask "which connector does the configured source use?".
 * Source, metadata, and query services share it, so URL parsing and the
 * UNSUPPORTED error stay consistent.
 */
@Injectable()
export class SourceConnectorService {
  constructor(
    private readonly config: ConfigService,
    private readonly registry: ConnectorRegistry,
  ) {}

  getConnector(): SourceConnector {
    const sourceUrl = this.config.getOrThrow<string>('SOURCE_DATABASE_URL');
    const kind = connectorKindFromUrl(sourceUrl);

    if (!kind) {
      throw new ConnectorError(
        ConnectorErrorCode.UNSUPPORTED,
        'Only PostgreSQL source databases are supported.',
      );
    }

    return this.registry.get(kind);
  }
}
