import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { CHART_SPEC_MODELS } from '../charts/charts.dto.js';
import { SemanticService } from '../semantic/semantic.service.js';
import {
  DashboardFilterError,
  validateDashboardFilters,
} from './dashboard-filters.js';
import {
  dashboardCreateSchema,
  dashboardWriteSchema,
  type DashboardWrite,
} from './dashboard-document.schema.js';
import {
  DashboardDto,
  DashboardListDto,
  DashboardWriteDto,
  CreateDashboardDto,
} from './dashboards.dto.js';
import { DashboardsService } from './dashboards.service.js';

@ApiTags('dashboards')
@ApiExtraModels(...CHART_SPEC_MODELS)
@Controller('dashboards')
export class DashboardsController {
  constructor(
    private readonly dashboardsService: DashboardsService,
    private readonly semanticService: SemanticService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List saved dashboards' })
  @ApiOkResponse({ type: DashboardListDto })
  list(): Promise<DashboardListDto> {
    return this.dashboardsService.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create an empty dashboard' })
  @ApiBody({ type: CreateDashboardDto })
  @ApiCreatedResponse({ type: DashboardDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'A dashboard with this name already exists',
    type: ApiErrorDto,
  })
  create(
    @Body(new ZodValidationPipe(dashboardCreateSchema)) body: { name: string },
  ): Promise<DashboardDto> {
    return this.dashboardsService.create(body.name);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One dashboard with its widgets' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: DashboardDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<DashboardDto> {
    return this.dashboardsService.get(id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Replace a dashboard (optimistic concurrency)',
    description:
      'Name, filters, and widgets are replaced in one transaction. If `expectedVersion` is stale the request fails with 409 and nothing is written (D56).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: DashboardWriteDto })
  @ApiOkResponse({ type: DashboardDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'The dashboard changed since `expectedVersion`',
    type: ApiErrorDto,
  })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async replace(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(dashboardWriteSchema)) body: DashboardWrite,
  ): Promise<DashboardDto> {
    if (Object.keys(body.filters).length > 0) {
      const context = await this.semanticService.getCatalog();

      if (!context) {
        throw new BadRequestException(
          'Save a semantic model before adding dashboard filters.',
        );
      }

      try {
        validateDashboardFilters(body.filters, context.catalog);
      } catch (error) {
        if (error instanceof DashboardFilterError) {
          throw new BadRequestException(error.issues);
        }
        throw error;
      }
    }

    return this.dashboardsService.replace(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a dashboard and its widgets' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'The dashboard was deleted.' })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.dashboardsService.remove(id);
  }
}
