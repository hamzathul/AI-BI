import { ApiProperty } from '@nestjs/swagger';

export class LastSyncDto {
  @ApiProperty({
    enum: ['RUNNING', 'SUCCEEDED', 'FAILED'],
    example: 'SUCCEEDED',
    description: 'Outcome of the sync attempt',
  })
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';

  @ApiProperty({
    example: '2026-10-20T08:15:00.000Z',
    description: 'When the sync started (ISO 8601)',
  })
  startedAt: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-10-20T08:15:01.250Z',
    description: 'When the sync finished (ISO 8601); null while running',
  })
  finishedAt: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'Safe, normalized failure message (D36); null on success',
  })
  error: string | null;
}

export class SourceStatusDto {
  @ApiProperty({
    example: true,
    description:
      'Source connection details are present in the environment (D30)',
  })
  configured: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'acme',
    description: 'Database name only — host and credentials are never exposed',
  })
  database: string | null;

  @ApiProperty({
    type: LastSyncDto,
    nullable: true,
    description: 'Most recent sync attempt, or null if none has run',
  })
  lastSync: LastSyncDto | null;
}
