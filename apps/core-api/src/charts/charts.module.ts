import { Module } from '@nestjs/common';
import { QueryModule } from '../query/query.module.js';
import { SemanticModule } from '../semantic/semantic.module.js';
import { ChartExecutionService } from './chart-execution.service.js';
import { ChartsController } from './charts.controller.js';

@Module({
  imports: [QueryModule, SemanticModule],
  controllers: [ChartsController],
  providers: [ChartExecutionService],
})
export class ChartsModule {}
