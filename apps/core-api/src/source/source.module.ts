import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module.js';
import { MetadataModule } from '../metadata/metadata.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SourceController } from './source.controller.js';
import { SourceService } from './source.service.js';

@Module({
  imports: [PrismaModule, ConnectorsModule, MetadataModule],
  controllers: [SourceController],
  providers: [SourceService],
})
export class SourceModule {}
