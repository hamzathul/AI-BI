import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  SemanticExampleResponseDto,
  SemanticModelDto,
  SemanticModelResponseDto,
  SemanticValidationResponseDto,
} from './semantic.dto.js';
import {
  semanticModelDocumentSchema,
  type SemanticModelDocument,
} from './semantic-model.schema.js';
import { SemanticService } from './semantic.service.js';

@ApiTags('semantic')
@Controller('semantic')
export class SemanticController {
  constructor(private readonly semanticService: SemanticService) {}

  @Get('model')
  @ApiOperation({
    summary: 'The saved semantic model',
    description:
      'Returns null before the first save. One model exists per deployment (D49).',
  })
  @ApiOkResponse({ type: SemanticModelResponseDto })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'The app database could not be read',
    type: ApiErrorDto,
  })
  getModel(): Promise<SemanticModelResponseDto> {
    return this.semanticService.getModel();
  }

  @Put('model')
  @ApiOperation({
    summary: 'Validate and replace the semantic model',
    description:
      'The whole document is replaced in one transaction after metadata validation.',
  })
  @ApiBody({ type: SemanticModelDto })
  @ApiOkResponse({ type: SemanticModelResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'The document is invalid or references missing metadata',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Unexpected server failure',
    type: ApiErrorDto,
  })
  saveModel(
    @Body(new ZodValidationPipe(semanticModelDocumentSchema))
    body: SemanticModelDocument,
  ): Promise<SemanticModelResponseDto> {
    return this.semanticService.save(body);
  }

  @Post('model/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate a semantic model without saving it',
    description:
      'Runs the same structural and metadata checks as PUT, then returns counts.',
  })
  @ApiBody({ type: SemanticModelDto })
  @ApiOkResponse({ type: SemanticValidationResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'The document is invalid or references missing metadata',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Unexpected server failure',
    type: ApiErrorDto,
  })
  validateModel(
    @Body(new ZodValidationPipe(semanticModelDocumentSchema))
    body: SemanticModelDocument,
  ): Promise<SemanticValidationResponseDto> {
    return this.semanticService.validate(body);
  }

  @Delete('model')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete the saved semantic model' })
  @ApiNoContentResponse({
    description: 'The model was deleted (or was absent).',
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Unexpected server failure',
    type: ApiErrorDto,
  })
  async deleteModel(): Promise<void> {
    await this.semanticService.delete();
  }

  @Get('example')
  @ApiOperation({
    summary: 'The Acme example semantic model',
    description:
      'HR and sales datasets, filtered metrics, time dimensions, and FK joins.',
  })
  @ApiOkResponse({ type: SemanticExampleResponseDto })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Unexpected server failure',
    type: ApiErrorDto,
  })
  getExample(): SemanticExampleResponseDto {
    return this.semanticService.getExample();
  }
}
