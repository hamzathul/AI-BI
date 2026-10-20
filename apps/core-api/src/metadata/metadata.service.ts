import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  MetadataColumnDto,
  MetadataObjectDto,
  MetadataRelationDto,
  MetadataSnapshotDto,
} from './metadata.dto.js';

interface StoredColumn {
  id: string;
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  comment: string | null;
  primaryKeyPosition: number | null;
  ordinalPosition: number;
}

@Injectable()
export class MetadataService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads the stored snapshot in one pass. Metadata is small (a company's
   * schemas), so a single tree response is simpler than paging for v0.
   */
  async getMetadata(): Promise<MetadataSnapshotDto> {
    const [objects, relations, lastSuccess] = await Promise.all([
      this.prisma.dbObject.findMany({
        include: {
          columns: { orderBy: { ordinalPosition: 'asc' } },
        },
        orderBy: [{ schemaName: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.dbRelation.findMany({
        include: {
          fromColumn: { include: { object: true } },
          toColumn: { include: { object: true } },
        },
        orderBy: [{ name: 'asc' }, { fromColumnId: 'asc' }],
      }),
      this.prisma.syncRun.findFirst({
        where: { status: 'SUCCEEDED' },
        orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
        select: { finishedAt: true },
      }),
    ]);

    const schemas = new Map<
      string,
      { name: string; objects: MetadataObjectDto[] }
    >();

    for (const object of objects) {
      let schema = schemas.get(object.schemaName);
      if (!schema) {
        schema = { name: object.schemaName, objects: [] };
        schemas.set(object.schemaName, schema);
      }

      const primaryKey = object.columns
        .filter((column) => column.primaryKeyPosition !== null)
        .sort(
          (left, right) =>
            (left.primaryKeyPosition ?? 0) - (right.primaryKeyPosition ?? 0),
        )
        .map((column) => column.name);

      schema.objects.push({
        id: object.id,
        name: object.name,
        kind: object.kind,
        primaryKey,
        columns: object.columns.map(toColumnDto),
      });
    }

    const relationDtos: MetadataRelationDto[] = relations.map((relation) => ({
      id: relation.id,
      name: relation.name,
      from: {
        schema: relation.fromColumn.object.schemaName,
        object: relation.fromColumn.object.name,
        column: relation.fromColumn.name,
      },
      to: {
        schema: relation.toColumn.object.schemaName,
        object: relation.toColumn.object.name,
        column: relation.toColumn.name,
      },
    }));

    return {
      syncedAt: lastSuccess?.finishedAt?.toISOString() ?? null,
      schemas: [...schemas.values()],
      relations: relationDtos,
    };
  }
}

function toColumnDto(column: StoredColumn): MetadataColumnDto {
  return {
    id: column.id,
    name: column.name,
    dataType: column.dataType,
    nullable: column.nullable,
    defaultValue: column.defaultValue,
    comment: column.comment,
    isPrimaryKey: column.primaryKeyPosition !== null,
    ordinalPosition: column.ordinalPosition,
  };
}
