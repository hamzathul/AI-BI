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
import { QueryExecutionResultDto, QuerySpecDto } from './query.dto.js';
import { QueryService } from './query.service.js';
import { querySpecSchema, type QuerySpec } from './query-spec.schema.js';

@ApiTags('query')
@Controller('query')
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Compile and execute a QuerySpec',
    description:
      'The request names metrics and dimensions from the saved semantic model. The backend compiles them to one parameterized SELECT, runs the SQL guard, and executes it against the read-only source (D9/D51).',
  })
  @ApiBody({ type: QuerySpecDto })
  @ApiOkResponse({ type: QueryExecutionResultDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'The spec is invalid, a name is unknown, no model is saved, or the compiled SQL was rejected',
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
    @Body(new ZodValidationPipe(querySpecSchema)) body: QuerySpec,
    @Res({ passthrough: true }) response: Response,
  ): Promise<QueryExecutionResultDto> {
    const abort = new AbortController();

    // Abort only on a premature disconnect; after a normal response
    // `writableEnded` is true and the query is already finished.
    response.on('close', () => {
      if (!response.writableEnded) abort.abort();
    });

    return this.queryService.executeSpec(body, abort.signal);
  }
}
