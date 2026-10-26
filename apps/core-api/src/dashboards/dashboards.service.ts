import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { ChartSpec } from '../charts/chart-spec.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DashboardFilters } from './dashboard-filters.schema.js';
import type {
  DashboardDto,
  DashboardListDto,
  DashboardSummaryDto,
  DashboardWidgetDto,
} from './dashboards.dto.js';

interface StoredWidget {
  id: string;
  chart: Prisma.JsonValue;
  layoutX: number;
  layoutY: number;
  layoutW: number;
  layoutH: number;
}

interface StoredDashboard {
  id: string;
  name: string;
  version: number;
  filters: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  widgets: StoredWidget[];
}

const WIDGET_ORDER = [
  { layoutY: 'asc' as const },
  { layoutX: 'asc' as const },
  { id: 'asc' as const },
];

/**
 * Stored JSON is written only after schema validation, so reads cast instead of
 * re-parsing. Execution still validates each chart spec, which keeps a future
 * schema change from turning a whole dashboard unreadable.
 */
function readFilters(value: Prisma.JsonValue | null): DashboardFilters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as unknown as DashboardFilters;
}

function toWidget(widget: StoredWidget): DashboardWidgetDto {
  return {
    id: widget.id,
    chart: widget.chart as unknown as ChartSpec,
    layout: {
      x: widget.layoutX,
      y: widget.layoutY,
      w: widget.layoutW,
      h: widget.layoutH,
    },
  };
}

function toDashboard(dashboard: StoredDashboard): DashboardDto {
  return {
    id: dashboard.id,
    name: dashboard.name,
    version: dashboard.version,
    filters: readFilters(dashboard.filters),
    widgets: dashboard.widgets.map(toWidget),
    createdAt: dashboard.createdAt.toISOString(),
    updatedAt: dashboard.updatedAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class DashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<DashboardListDto> {
    const rows = await this.prisma.dashboard.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        version: true,
        updatedAt: true,
        _count: { select: { widgets: true } },
      },
    });

    const dashboards: DashboardSummaryDto[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      widgetCount: row._count.widgets,
      updatedAt: row.updatedAt.toISOString(),
    }));

    return { dashboards };
  }

  async get(id: string): Promise<DashboardDto> {
    const dashboard = await this.prisma.dashboard.findUnique({
      where: { id },
      include: { widgets: { orderBy: WIDGET_ORDER } },
    });

    if (!dashboard) {
      throw new NotFoundException(`Dashboard "${id}" does not exist.`);
    }

    return toDashboard(dashboard as StoredDashboard);
  }

  async create(name: string): Promise<DashboardDto> {
    try {
      const dashboard = await this.prisma.dashboard.create({
        data: { name, filters: {}, widgets: { create: [] } },
        include: { widgets: { orderBy: WIDGET_ORDER } },
      });

      return toDashboard(dashboard as StoredDashboard);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `A dashboard named "${name}" already exists.`,
        );
      }
      throw error;
    }
  }

  /**
   * Replaces name, filters, and widgets in one transaction, guarded by the
   * version the editor started from (D56). Widgets are replaced rather than
   * diffed: the document is small and a partial write never reaches readers.
   */
  async replace(
    id: string,
    input: {
      expectedVersion: number;
      name: string;
      filters: DashboardFilters;
      widgets: Array<{ id: string; chart: ChartSpec; layout: DashboardWidgetDto['layout'] }>;
    },
  ): Promise<DashboardDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.dashboard.updateMany({
          where: { id, version: input.expectedVersion },
          data: {
            name: input.name,
            filters: input.filters as unknown as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
        });

        if (updated.count === 0) {
          const existing = await tx.dashboard.findUnique({
            where: { id },
            select: { version: true },
          });

          if (!existing) {
            throw new NotFoundException(`Dashboard "${id}" does not exist.`);
          }

          throw new ConflictException(
            `This dashboard changed since version ${input.expectedVersion} (it is now version ${existing.version}). Reload it and try again.`,
          );
        }

        await tx.widget.deleteMany({ where: { dashboardId: id } });
        await tx.widget.createMany({
          data: input.widgets.map((widget) => ({
            id: widget.id,
            dashboardId: id,
            chart: widget.chart as unknown as Prisma.InputJsonValue,
            layoutX: widget.layout.x,
            layoutY: widget.layout.y,
            layoutW: widget.layout.w,
            layoutH: widget.layout.h,
          })),
        });

        const saved = await tx.dashboard.findUniqueOrThrow({
          where: { id },
          include: { widgets: { orderBy: WIDGET_ORDER } },
        });

        return toDashboard(saved as StoredDashboard);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `A dashboard named "${input.name}" already exists.`,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.prisma.dashboard.deleteMany({ where: { id } });

    if (deleted.count === 0) {
      throw new NotFoundException(`Dashboard "${id}" does not exist.`);
    }
  }
}
