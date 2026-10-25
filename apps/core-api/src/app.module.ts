import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConnectorsModule } from './connectors/connectors.module.js';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { MetadataModule } from './metadata/metadata.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QueryModule } from './query/query.module.js';
import { SemanticModule } from './semantic/semantic.module.js';
import { SourceModule } from './source/source.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    ConnectorsModule,
    MetadataModule,
    SemanticModule,
    QueryModule,
    HealthModule,
    SourceModule,
  ],
})
export class AppModule {}
