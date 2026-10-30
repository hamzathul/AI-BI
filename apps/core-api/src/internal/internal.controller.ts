import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { QueryExecutionResultDto } from '../query/query.dto.js';
import { QueryService } from '../query/query.service.js';
import { querySpecSchema, type QuerySpec } from '../query/query-spec.schema.js';
import type { InternalContextDto } from './internal.dto.js';
import { InternalContextService } from './internal-context.service.js';
import { InternalTokenGuard } from './internal-token.guard.js';

/**
 * Server-to-server surface for ai-service (D60). Not part of the public
 * contract: `@ApiExcludeController` keeps it out of Swagger and out of the
 * generated web client, and the guard keeps everyone else out.
 *
 * The two routes are the whole surface on purpose — read the model, execute a
 * QuerySpec. No writes, no metadata, no raw SQL.
 */
@ApiExcludeController()
@Controller('internal')
@UseGuards(InternalTokenGuard)
export class InternalController {
  constructor(
    private readonly contextService: InternalContextService,
    private readonly queryService: QueryService,
  ) {}

  @Get('context')
  getContext(): Promise<InternalContextDto> {
    return this.contextService.getContext();
  }

  @Post('specs/execute')
  @HttpCode(HttpStatus.OK)
  async executeSpec(
    @Body(new ZodValidationPipe(querySpecSchema)) body: QuerySpec,
    @Res({ passthrough: true }) response: Response,
  ): Promise<QueryExecutionResultDto> {
    // Same pipeline and error mapping as `POST /api/query/execute` (D52):
    // the AI never gets its own query path.
    const abort = new AbortController();

    response.on('close', () => {
      if (!response.writableEnded) abort.abort();
    });

    return this.queryService.executeSpec(body, abort.signal);
  }
}
