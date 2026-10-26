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
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  ChartExecutionRequestDto,
  ChartExecutionResponseDto,
} from './chart-execution.dto.js';
import {
  chartExecutionRequestSchema,
  type ChartExecutionRequest,
} from './chart-execution.schema.js';
import { ChartExecutionService } from './chart-execution.service.js';
import { CHART_SPEC_MODELS } from './charts.dto.js';

@ApiTags('charts')
@ApiExtraModels(...CHART_SPEC_MODELS)
@Controller('charts')
export class ChartsController {
  constructor(private readonly chartExecutionService: ChartExecutionService) {}

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Compile and execute dashboard charts',
    description:
      'Each chart owns a QuerySpec. Dashboard filters are merged into that spec server-side, then every chart is compiled, guarded, and executed against the read-only source. A failing chart returns its own error instead of failing the batch (D55).',
  })
  @ApiBody({ type: ChartExecutionRequestDto })
  @ApiOkResponse({ type: ChartExecutionResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'A chart or filter is invalid, a dashboard filter names an unknown dimension, or no semantic model is saved',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Unexpected server failure',
    type: ApiErrorDto,
  })
  async execute(
    @Body(new ZodValidationPipe(chartExecutionRequestSchema))
    body: ChartExecutionRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ChartExecutionResponseDto> {
    const abort = new AbortController();

    response.on('close', () => {
      if (!response.writableEnded) abort.abort();
    });

    return this.chartExecutionService.execute(body, abort.signal);
  }
}
