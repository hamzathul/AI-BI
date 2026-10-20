import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SourceStatusDto } from './source.dto.js';
import { SourceService } from './source.service.js';

@ApiTags('source')
@Controller('source')
export class SourceController {
  constructor(private readonly sourceService: SourceService) {}

  @Get()
  @ApiOperation({ summary: 'Configured source database status' })
  @ApiOkResponse({ type: SourceStatusDto })
  getStatus(): Promise<SourceStatusDto> {
    return this.sourceService.getStatus();
  }
}
