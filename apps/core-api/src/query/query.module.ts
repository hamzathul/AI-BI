import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module.js';
import { SemanticModule } from '../semantic/semantic.module.js';
import { QueryController } from './query.controller.js';
import { QueryService } from './query.service.js';

@Module({
  imports: [ConnectorsModule, SemanticModule],
  controllers: [QueryController],
  providers: [QueryService],
})
export class QueryModule {}
