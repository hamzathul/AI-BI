import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Provides the app-database client. Modules that need the database import
 * this module — deliberately not `@Global()`, so dependencies stay visible
 * (D35; easy to flip later if the import line becomes noise).
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
