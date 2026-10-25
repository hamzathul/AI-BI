import { Module } from '@nestjs/common';
import { MetadataModule } from '../metadata/metadata.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SemanticController } from './semantic.controller.js';
import { SemanticService } from './semantic.service.js';

@Module({
  imports: [PrismaModule, MetadataModule],
  controllers: [SemanticController],
  providers: [SemanticService],
  exports: [SemanticService],
})
export class SemanticModule {}
