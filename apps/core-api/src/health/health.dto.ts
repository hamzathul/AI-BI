import { ApiProperty } from '@nestjs/swagger';

export class HealthDto {
  @ApiProperty({ example: 'ok', description: 'Service liveness' })
  status: 'ok';

  @ApiProperty({ example: 12, description: 'Process uptime in seconds' })
  uptime: number;

  @ApiProperty({
    example: '2026-10-19T15:07:33.019Z',
    description: 'ISO 8601 timestamp',
  })
  timestamp: string;
}
