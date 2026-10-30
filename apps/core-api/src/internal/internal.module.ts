import { Module } from '@nestjs/common';
import { QueryModule } from '../query/query.module.js';
import { SemanticModule } from '../semantic/semantic.module.js';
import { InternalContextService } from './internal-context.service.js';
import { InternalTokenGuard } from './internal-token.guard.js';
import { InternalController } from './internal.controller.js';

@Module({
  imports: [SemanticModule, QueryModule],
  controllers: [InternalController],
  providers: [InternalContextService, InternalTokenGuard],
})
export class InternalModule {}
