import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  QueryRequestDto,
  QueryResultDto,
  queryRequestSchema,
} from './query.dto.js';
import { QueryService } from './query.service.js';

@ApiTags('query')
@Controller('query')
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Execute one guarded, read-only SQL statement',
    description:
      'Temporary Phase 2 verification surface. Phase 4 replaces raw SQL with QuerySpec → compiler → guard (D9/D42).',
  })
  @ApiBody({ type: QueryRequestDto })
  @ApiOkResponse({ type: QueryResultDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'The SQL was rejected by validation or the guard',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description: 'The source is unreachable or rejected the credentials',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.GATEWAY_TIMEOUT,
    description: 'The query timed out or was canceled',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Unexpected server failure',
    type: ApiErrorDto,
  })
  async execute(
    @Body(new ZodValidationPipe(queryRequestSchema)) body: QueryRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<QueryResultDto> {
    const abort = new AbortController();

    // Abort only on a premature disconnect; after a normal response
    // `writableEnded` is true and the query is already finished.
    response.on('close', () => {
      if (!response.writableEnded) abort.abort();
    });

    return this.queryService.execute(body.sql, abort.signal);
  }
}
