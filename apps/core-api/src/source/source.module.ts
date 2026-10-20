import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SourceController } from './source.controller.js';
import { SourceService } from './source.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [SourceController],
  providers: [SourceService],
})
export class SourceModule {}
