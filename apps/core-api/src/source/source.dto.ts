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

export class ConnectionTestDto {
  @ApiProperty({
    example: '18.6',
    description: 'PostgreSQL server version reported by the source',
  })
  serverVersion: string;

  @ApiProperty({
    example: 'acme',
    description: 'Database the credentials actually connected to',
  })
  database: string;

  @ApiProperty({
    example: true,
    description:
      'True when the role has no write or DDL privileges on the source',
  })
  readOnly: boolean;

  @ApiProperty({
    example: 4,
    description: 'Round-trip time of the catalog audit query, in milliseconds',
  })
  latencyMs: number;
}

export class SyncCountsDto {
  @ApiProperty({ example: 2 })
  schemas: number;

  @ApiProperty({ example: 8 })
  objects: number;

  @ApiProperty({ example: 38 })
  columns: number;

  @ApiProperty({ example: 5 })
  relations: number;
}

export class SyncResultDto {
  @ApiProperty({ example: '0b7a7a7e-...' })
  id: string;

  @ApiProperty({
    enum: ['RUNNING', 'SUCCEEDED', 'FAILED'],
    example: 'SUCCEEDED',
  })
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';

  @ApiProperty({ example: '2026-10-20T08:15:00.000Z' })
  startedAt: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-10-20T08:15:01.250Z',
  })
  finishedAt: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  error: string | null;

  @ApiProperty({ type: SyncCountsDto })
  counts: SyncCountsDto;
}
