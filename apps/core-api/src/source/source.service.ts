import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SyncRun } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LastSyncDto, SourceStatusDto } from './source.dto.js';

type SyncSummary = Pick<
  SyncRun,
  'status' | 'startedAt' | 'finishedAt' | 'error'
>;

/**
 * The database name from a connection URL, and nothing else.
 *
 * `SOURCE_DATABASE_URL` also holds credentials and host; only the path is safe
 * to expose (D30/D37). Returns null when the URL carries no database name.
 */
function databaseNameFromUrl(sourceUrl: string): string | null {
  const path = new URL(sourceUrl).pathname.replace(/^\//, '');
  if (!path) return null;

  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function toLastSyncDto(run: SyncSummary): LastSyncDto {
  return {
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    error: run.error,
  };
}

@Injectable()
export class SourceService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Status of the env-configured source, answered from the app database and
   * environment only — it never connects to the source (that is 2.4's job).
   */
  async getStatus(): Promise<SourceStatusDto> {
    const sourceUrl = this.config.getOrThrow<string>('SOURCE_DATABASE_URL');
    const lastRun = await this.prisma.syncRun.findFirst({
      // uuid(7) is time-ordered, so it breaks same-millisecond ties.
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      select: {
        status: true,
        startedAt: true,
        finishedAt: true,
        error: true,
      },
    });

    return {
      // D30: the app refuses to boot without SOURCE_DATABASE_URL, so this is
      // always true today. The field keeps the contract ready for an optional
      // source later.
      configured: true,
      database: databaseNameFromUrl(sourceUrl),
      lastSync: lastRun ? toLastSyncDto(lastRun) : null,
    };
  }
}
