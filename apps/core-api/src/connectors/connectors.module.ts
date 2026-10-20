import { Module } from '@nestjs/common';
import { ConnectorRegistry } from './connector.registry.js';
import { PostgresConnector } from './postgres/postgres.connector.js';
import { SourceConnectorService } from './source-connector.service.js';

/**
 * Wires concrete connectors into the registry (D38).
 *
 * A factory builds the registry from the providers, so registration is explicit
 * and testable — no decorator magic or module-level mutable state.
 */
@Module({
  providers: [
    PostgresConnector,
    {
      provide: ConnectorRegistry,
      useFactory: (postgres: PostgresConnector) => {
        const registry = new ConnectorRegistry();
        registry.register(postgres);
        return registry;
      },
      inject: [PostgresConnector],
    },
    SourceConnectorService,
  ],
  exports: [ConnectorRegistry, SourceConnectorService],
})
export class ConnectorsModule {}
