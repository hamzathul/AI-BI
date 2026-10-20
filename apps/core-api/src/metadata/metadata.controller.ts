import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  getMetadata(): Promise<MetadataSnapshotDto> {
    return this.metadataService.getMetadata();
  }
}
