import { ConflictException, Injectable } from '@nestjs/common';
import {
  ConnectorError,
  ConnectorErrorCode,
} from '../connectors/connector.errors.js';
import { SourceConnectorService } from '../connectors/source-connector.service.js';
import type { DiscoveredDatabase } from '../connectors/connector.types.js';
import type { SyncRun } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SyncCountsDto, SyncResultDto } from '../source/source.dto.js';

/** A RUNNING row older than this is treated as interrupted (crashed process). */
export const STALE_SYNC_MS = 15 * 60 * 1000;

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceConnector: SourceConnectorService,
  ) {}

  /**
   * Full metadata sync, synchronous for v0 (D41).
   *
   * Order matters: clear stale RUNNING rows → refuse concurrent syncs →
   * record RUNNING → discover → replace the snapshot atomically → record the
   * outcome. A failure after discovery still leaves a FAILED row behind, so
   * `GET /api/source` tells the whole story.
   */
  async runSync(): Promise<SyncResultDto> {
    const now = new Date();

    await this.prisma.syncRun.updateMany({
      where: {
        status: 'RUNNING',
        startedAt: { lt: new Date(now.getTime() - STALE_SYNC_MS) },
      },
      data: {
        status: 'FAILED',
        finishedAt: now,
        error: 'Sync was interrupted and marked stale.',
      },
    });

    const running = await this.prisma.syncRun.findFirst({
      where: { status: 'RUNNING' },
      select: { id: true },
    });

    if (running) {
      throw new ConflictException('A metadata sync is already running.');
    }

    const run = await this.prisma.syncRun.create({
      data: { status: 'RUNNING' },
    });

    try {
      const discovered = await this.sourceConnector
        .getConnector()
        .discoverSchema();
      const counts = await this.replaceMetadata(discovered);
      const finished = await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { status: 'SUCCEEDED', finishedAt: new Date() },
      });

      return { ...toRunSummary(finished), counts };
    } catch (error) {
      const mapped = toSyncError(error);

      await this.prisma.syncRun
        .update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            error: mapped.message,
          },
        })
        .catch(() => undefined);

      throw mapped;
    }
  }

  /**
   * Replaces the snapshot inside one transaction, so readers see either the
   * previous sync or the new one — never a half-deleted tree.
   */
  private async replaceMetadata(
    discovered: DiscoveredDatabase,
  ): Promise<SyncCountsDto> {
    const counts: SyncCountsDto = {
      // Only schemas with objects are browsable; an empty `public` adds noise.
      schemas: discovered.schemas.filter((schema) => schema.objects.length > 0)
        .length,
      objects: 0,
      columns: 0,
      relations: 0,
    };

    await this.prisma.$transaction(async (tx) => {
      // Children first: db_relations → db_columns → db_objects.
      await tx.dbRelation.deleteMany();
      await tx.dbColumn.deleteMany();
      await tx.dbObject.deleteMany();

      const columnIds = new Map<string, string>();

      for (const schema of discovered.schemas) {
        for (const object of schema.objects) {
          const created = await tx.dbObject.create({
            data: {
              schemaName: schema.name,
              name: object.name,
              kind: object.kind === 'view' ? 'VIEW' : 'TABLE',
            },
          });

          const createdColumns =
            object.columns.length === 0
              ? []
              : await tx.dbColumn.createManyAndReturn({
                  data: object.columns.map((column) => ({
                    objectId: created.id,
                    name: column.name,
                    dataType: column.dataType,
                    nullable: column.nullable,
                    defaultValue: column.defaultValue,
                    comment: column.comment,
                    primaryKeyPosition: primaryKeyPosition(
                      object.primaryKey,
                      column.name,
                    ),
                    ordinalPosition: column.ordinalPosition,
                  })),
                  select: { id: true, name: true },
                });

          for (const column of createdColumns) {
            columnIds.set(
              columnKey(schema.name, object.name, column.name),
              column.id,
            );
          }

          counts.objects += 1;
          counts.columns += createdColumns.length;
        }
      }

      const relationRows = discovered.relations.flatMap((relation) => {
        const fromColumnId = columnIds.get(
          columnKey(
            relation.from.schema,
            relation.from.object,
            relation.from.column,
          ),
        );
        const toColumnId = columnIds.get(
          columnKey(relation.to.schema, relation.to.object, relation.to.column),
        );

        return fromColumnId && toColumnId
          ? [{ name: relation.name, fromColumnId, toColumnId }]
          : [];
      });

      if (relationRows.length > 0) {
        await tx.dbRelation.createMany({ data: relationRows });
      }

      counts.relations = relationRows.length;
    });

    return counts;
  }
}

function columnKey(schema: string, object: string, column: string): string {
  return `${schema}\u0000${object}\u0000${column}`;
}

function primaryKeyPosition(
  primaryKey: string[],
  columnName: string,
): number | null {
  const position = primaryKey.indexOf(columnName);
  return position === -1 ? null : position + 1;
}

function toRunSummary(
  run: Pick<SyncRun, 'id' | 'status' | 'startedAt' | 'finishedAt' | 'error'>,
): Pick<SyncResultDto, 'id' | 'status' | 'startedAt' | 'finishedAt' | 'error'> {
  return {
    id: run.id,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    error: run.error,
  };
}

function toSyncError(error: unknown): ConnectorError {
  if (error instanceof ConnectorError) return error;

  return new ConnectorError(
    ConnectorErrorCode.INTERNAL,
    'The metadata sync failed.',
    { cause: error },
  );
}
