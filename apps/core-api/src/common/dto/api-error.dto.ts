import { ApiProperty } from '@nestjs/swagger';
import { ConnectorErrorCode } from '../../connectors/connector.errors.js';

/**
 * The one error envelope every route returns (D29), now part of the OpenAPI
 * contract so the web client can generate a typed error object (D44).
 */
export class ApiErrorDto {
  @ApiProperty({ example: 502 })
  statusCode: number;

  @ApiProperty({ example: 'Bad Gateway' })
  error: string;

  @ApiProperty({
    description:
      'Safe, human-readable message. Validation errors may return a list.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'The source database rejected the credentials.',
  })
  message: string | string[];

  @ApiProperty({
    enum: ConnectorErrorCode,
    required: false,
    description: 'Normalized connector code, present only for source failures.',
  })
  code?: (typeof ConnectorErrorCode)[keyof typeof ConnectorErrorCode];

  @ApiProperty({ example: '/api/source/test' })
  path: string;

  @ApiProperty({ example: '2026-10-20T08:15:01.250Z' })
  timestamp: string;
}
