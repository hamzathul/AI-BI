import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * The app-database client (D30), managed by Nest's DI container.
 *
 * Extends the generated client, so injecting `PrismaService` gives services
 * the full typed API (`prisma.syncRun.create(...)` etc.). The connection is
 * lazy — the pg pool opens its first socket on the first query — so app boot
 * and `/api/health` work even when the database is down (D35).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        // Zod validated this at boot (D28); getOrThrow keeps that contract.
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
      }),
    });
  }

  /**
   * Called by Nest when the app closes (`app.close()`, or SIGINT/SIGTERM via
   * `enableShutdownHooks()`). Disconnecting here releases the pool so the
   * process can exit cleanly.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
