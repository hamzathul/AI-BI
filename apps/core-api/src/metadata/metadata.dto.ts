import { ApiProperty } from '@nestjs/swagger';

export class MetadataColumnDto {
  @ApiProperty({ example: '0b7a7a7e-...' })
  id: string;

  @ApiProperty({ example: 'salary' })
  name: string;

  @ApiProperty({
    example: 'numeric(10,2)',
    description: 'Canonical type from the connector (D40)',
  })
  dataType: string;

  @ApiProperty({ example: false })
  nullable: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'Column default expression, as reported by Postgres',
  })
  defaultValue: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Annual gross salary.',
  })
  comment: string | null;

  @ApiProperty({ example: false })
  isPrimaryKey: boolean;

  @ApiProperty({ example: 8, description: '1-based position in the table' })
  ordinalPosition: number;
}

export class MetadataObjectDto {
  @ApiProperty({ example: '0b7a7a7e-...' })
  id: string;

  @ApiProperty({ example: 'employees' })
  name: string;

  @ApiProperty({ enum: ['TABLE', 'VIEW'], example: 'TABLE' })
  kind: 'TABLE' | 'VIEW';

  @ApiProperty({
    type: [String],
    example: ['id'],
    description: 'Primary-key column names in key order',
  })
  primaryKey: string[];

  @ApiProperty({ type: [MetadataColumnDto] })
  columns: MetadataColumnDto[];
}

export class MetadataSchemaDto {
  @ApiProperty({ example: 'hr' })
  name: string;

  @ApiProperty({ type: [MetadataObjectDto] })
  objects: MetadataObjectDto[];
}

export class MetadataRelationEndpointDto {
  @ApiProperty({ example: 'hr' })
  schema: string;

  @ApiProperty({ example: 'employees' })
  object: string;

  @ApiProperty({ example: 'department_id' })
  column: string;
}

export class MetadataRelationDto {
  @ApiProperty({ example: '0b7a7a7e-...' })
  id: string;

  @ApiProperty({ example: 'employees_department_id_fkey' })
  name: string;

  @ApiProperty({ type: MetadataRelationEndpointDto })
  from: MetadataRelationEndpointDto;

  @ApiProperty({ type: MetadataRelationEndpointDto })
  to: MetadataRelationEndpointDto;
}

export class MetadataSnapshotDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-10-20T08:15:01.250Z',
    description: 'When the last successful sync finished; null before any sync',
  })
  syncedAt: string | null;

  @ApiProperty({ type: [MetadataSchemaDto] })
  schemas: MetadataSchemaDto[];

  @ApiProperty({ type: [MetadataRelationDto] })
  relations: MetadataRelationDto[];
}
