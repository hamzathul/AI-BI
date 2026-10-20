import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { SyncService } from '../metadata/sync.service.js';
import {
  ConnectionTestDto,
  SourceStatusDto,
  SyncResultDto,
} from './source.dto.js';
import { SourceService } from './source.service.js';

@ApiTags('source')
@Controller('source')
export class SourceController {
  constructor(
    private readonly sourceService: SourceService,
    private readonly syncService: SyncService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Configured source database status' })
  @ApiOkResponse({ type: SourceStatusDto })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'The app database could not be read',
    type: ApiErrorDto,
  })
  getStatus(): Promise<SourceStatusDto> {
    return this.sourceService.getStatus();
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Test the source connection and verify read-only privileges',
  })
  @ApiOkResponse({
    type: ConnectionTestDto,
    description: 'The source is reachable and the role was audited',
  })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description: 'The source is unreachable or rejected the credentials',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.GATEWAY_TIMEOUT,
    description: 'The source did not respond in time',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Unexpected server failure',
    type: ApiErrorDto,
  })
  testConnection(): Promise<ConnectionTestDto> {
    return this.sourceService.testConnection();
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Discover the source schema and replace the stored metadata',
  })
  @ApiOkResponse({
    type: SyncResultDto,
    description: 'The sync completed; counts describe the stored snapshot',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Another metadata sync is already running',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description: 'The source is unreachable or rejected the credentials',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.GATEWAY_TIMEOUT,
    description: 'The source did not respond in time',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Unexpected server failure',
    type: ApiErrorDto,
  })
  runSync(): Promise<SyncResultDto> {
    return this.syncService.runSync();
  }
}
