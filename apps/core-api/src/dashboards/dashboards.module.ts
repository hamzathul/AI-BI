import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SemanticModule } from '../semantic/semantic.module.js';
import { DashboardsController } from './dashboards.controller.js';
import { DashboardsService } from './dashboards.service.js';

@Module({
  imports: [PrismaModule, SemanticModule],
  controllers: [DashboardsController],
  providers: [DashboardsService],
})
export class DashboardsModule {}
