import { Controller, Get, HttpStatus } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { MetadataSnapshotDto } from './metadata.dto.js';
import { MetadataService } from './metadata.service.js';

@ApiTags('metadata')
@Controller('metadata')
export class MetadataController {
  constructor(private readonly metadataService: MetadataService) {}

  @Get()
  @ApiOperation({ summary: 'Stored source metadata snapshot' })
  @ApiOkResponse({
    type: MetadataSnapshotDto,
    description: 'Schemas, objects, columns, and foreign-key relations',
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'The stored metadata could not be read',
    type: ApiErrorDto,
  })
  getMetadata(): Promise<MetadataSnapshotDto> {
    return this.metadataService.getMetadata();
  }
}
