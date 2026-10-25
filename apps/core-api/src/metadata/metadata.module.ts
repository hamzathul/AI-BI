import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MetadataController } from './metadata.controller.js';
import { MetadataService } from './metadata.service.js';
import { SyncService } from './sync.service.js';

@Module({
  imports: [PrismaModule, ConnectorsModule],
  controllers: [MetadataController],
  providers: [MetadataService, SyncService],
  exports: [MetadataService, SyncService],
})
export class MetadataModule {}
