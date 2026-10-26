"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Layout } from "react-grid-layout";
import {
  AlertCircle,
  ArrowLeft,
  GripVertical,
  LayoutDashboard,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ChartView } from "@/components/charts/chart-view";
import { DashboardFilterBar } from "@/components/dashboards/dashboard-filters";
import { WidgetDialog } from "@/components/dashboards/widget-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartBatch } from "@/hooks/use-chart-execution";
import { useDashboard, useSaveDashboard } from "@/hooks/use-dashboards";
import { useMetadata } from "@/hooks/use-metadata";
import { useSemanticModel } from "@/hooks/use-semantic-model";
import { ApiError, getErrorMessage } from "@/lib/api/client";
import type {
  ChartExecutionResultItem,
  ChartSpec,
  DashboardFilters,
  DashboardWidget,
} from "@/lib/api/types";
import { buildSemanticGraph } from "@/lib/semantic-graph";

/**
 * The grid measures the DOM before it can place a tile, so it must not render
 * on the server. `SSR: false` is set here because a Client Component is the
 * only place where it takes effect.
 */
const DashboardGrid = dynamic(() => import("./dashboard-grid"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});

const MAX_WIDGETS = 12;

/** Mirrors the grid constants; a tile's body is its outer height minus chrome. */
const ROW_HEIGHT = 40;
const MARGIN = 12;

const EMPTY_FILTERS: DashboardFilters = {};

interface Draft {
  name: string;
  filters: DashboardFilters;
  widgets: DashboardWidget[];
}

interface Snapshot extends Draft {
  version: number;
}

function draftOf(snapshot: Snapshot): Draft {
  return {
    name: snapshot.name,
    filters: snapshot.filters,
    widgets: snapshot.widgets,
  };
}

/**
 * Stable comparison key for "is this canvas dirty?". Filters are normalised so
 * an undefined end date and a missing key compare equal.
 */
function documentKey(document: Draft): string {
  const { dateRange, categorical } = document.filters;

  return JSON.stringify({
    name: document.name.trim(),
    filters: {
      ...(dateRange
        ? {
            dateRange: {
              dimension: dateRange.dimension,
              from: dateRange.from ?? null,
              to: dateRange.to ?? null,
            },
          }
        : {}),
      ...(categorical
        ? {
            categorical: {
              dimension: categorical.dimension,
              value: categorical.value,
            },
          }
        : {}),
    },
    widgets: document.widgets.map((widget) => ({
      id: widget.id,
      chart: widget.chart,
      layout: widget.layout,
    })),
  });
}

function widgetBodyHeight(widget: DashboardWidget): number {
  const outer = widget.layout.h * ROW_HEIGHT + (widget.layout.h - 1) * MARGIN;
  return Math.max(96, outer - 52);
}

function defaultSize(type: ChartSpec["type"]): { w: number; h: number } {
  if (type === "kpi") return { w: 3, h: 3 };
  if (type === "table") return { w: 6, h: 8 };
  return { w: 6, h: 7 };
}

const WidgetCard = memo(function WidgetCard({
  widget,
  item,
  onEdit,
  onRemove,
}: {
  widget: DashboardWidget;
  item?: ChartExecutionResultItem;
  onEdit: (widget: DashboardWidget) => void;
  onRemove: (id: string) => void;
}) {
  const height = widgetBodyHeight(widget);
  const error = item && !item.ok ? item.error?.message : undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5">
        <button
          type="button"
          className="widget-drag-handle cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label={`Drag ${widget.chart.title}`}
        >
          <GripVertical className="size-4" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {widget.chart.title}
        </p>
        <Badge variant="secondary">{widget.chart.type}</Badge>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Edit ${widget.chart.title}`}
          onClick={() => onEdit(widget)}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${widget.chart.title}`}
          onClick={() => onRemove(widget.id)}
        >
          <Trash2 />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <ChartView
          chart={widget.chart}
          result={item?.result}
          error={error}
          height={height}
          emptyMessage="This query returned no rows."
        />
      </div>
    </div>
  );
});

export function DashboardCanvas({ id }: { id: string }) {
  const dashboardQuery = useDashboard(id);
  const modelQuery = useSemanticModel();
  const metadataQuery = useMetadata();
  const saveMutation = useSaveDashboard(id);

  const graph = useMemo(
    () =>
      modelQuery.data?.model
        ? buildSemanticGraph(modelQuery.data.model, metadataQuery.data)
        : null,
    [modelQuery.data, metadataQuery.data],
  );

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<Snapshot | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    { mode: "add" } | { mode: "edit"; widgetId: string } | null
  >(null);

  // Seed the canvas once per dashboard. Refetches after a save must not
  // overwrite an edit that is already in progress.
  const seeded = useRef<string | null>(null);
  const server = dashboardQuery.data;

  useEffect(() => {
    if (!server || seeded.current === server.id) return;

    seeded.current = server.id;
    const snapshot: Snapshot = {
      version: server.version,
      name: server.name,
      filters: server.filters,
      widgets: server.widgets,
    };

    setSaved(snapshot);
    setDraft(draftOf(snapshot));
    setConflict(null);
  }, [server]);

  const items = useMemo(
    () =>
      (draft?.widgets ?? []).map((widget) => ({
        id: widget.id,
        chart: widget.chart,
      })),
    [draft?.widgets],
  );

  const batch = useChartBatch(items, draft?.filters ?? EMPTY_FILTERS);

  const resultsById = useMemo(
    () =>
      new Map(
        (batch.data?.results ?? []).map((item) => [item.id, item] as const),
      ),
    [batch.data],
  );

  const dirty = useMemo(() => {
    if (!draft || !saved) return false;
    return documentKey(draft) !== documentKey(saved);
  }, [draft, saved]);

  const handleLayoutChange = useCallback((layout: Layout) => {
    const positions = new Map(layout.map((item) => [item.i, item] as const));

    setDraft((current) => {
      if (!current) return current;

      let changed = false;

      const widgets = current.widgets.map((widget) => {
        const next = positions.get(widget.id);
        if (!next) return widget;

        const { x, y, w, h } = widget.layout;
        if (next.x === x && next.y === y && next.w === w && next.h === h) {
          return widget;
        }

        changed = true;
        return {
          ...widget,
          layout: { x: next.x, y: next.y, w: next.w, h: next.h },
        };
      });

      return changed ? { ...current, widgets } : current;
    });
  }, []);

  const onRemove = useCallback((widgetId: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            widgets: current.widgets.filter((widget) => widget.id !== widgetId),
          }
        : current,
    );
  }, []);

  const onEdit = useCallback((widget: DashboardWidget) => {
    setDialog({ mode: "edit", widgetId: widget.id });
  }, []);

  const editingWidget =
    dialog?.mode === "edit"
      ? draft?.widgets.find((widget) => widget.id === dialog.widgetId)
      : undefined;

  const renderWidget = useCallback(
    (widget: DashboardWidget) => (
      <WidgetCard
        widget={widget}
        item={resultsById.get(widget.id)}
        onEdit={onEdit}
        onRemove={onRemove}
      />
    ),
    [resultsById, onEdit, onRemove],
  );

  function applyWidgetChart(chart: ChartSpec) {
    if (!draft) return;

    if (dialog?.mode === "edit") {
      setDraft({
        ...draft,
        widgets: draft.widgets.map((widget) =>
          widget.id === dialog.widgetId ? { ...widget, chart } : widget,
        ),
      });
    } else {
      const size = defaultSize(chart.type);
      const bottom = draft.widgets.reduce(
        (max, widget) => Math.max(max, widget.layout.y + widget.layout.h),
        0,
      );

      setDraft({
        ...draft,
        widgets: [
          ...draft.widgets,
          {
            id: crypto.randomUUID(),
            chart,
            layout: { x: 0, y: bottom, ...size },
          },
        ],
      });
    }

    setDialog(null);
  }

  async function onSave() {
    if (!draft || !saved) return;

    try {
      const result = await saveMutation.mutateAsync({
        expectedVersion: saved.version,
        name: draft.name.trim(),
        filters: draft.filters,
        widgets: draft.widgets,
      });

      const snapshot: Snapshot = {
        version: result.version,
        name: result.name,
        filters: result.filters,
        widgets: result.widgets,
      };

      setSaved(snapshot);
      setDraft(draftOf(snapshot));
      setConflict(null);
      toast.success(`Saved version ${snapshot.version}.`);
    } catch (error) {
      // A 409 means someone else saved first; reloading is the only safe move.
      if (error instanceof ApiError && error.status === 409) {
        setConflict(error.message);
        return;
      }

      toast.error(getErrorMessage(error));
    }
  }

  async function onReload() {
    const result = await dashboardQuery.refetch();
    if (!result.data) return;

    const snapshot: Snapshot = {
      version: result.data.version,
      name: result.data.name,
      filters: result.data.filters,
      widgets: result.data.widgets,
    };

    setSaved(snapshot);
    setDraft(draftOf(snapshot));
    setConflict(null);
  }

  if (dashboardQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (dashboardQuery.error) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Dashboard"
          description="This dashboard could not be loaded."
          actions={
            <Button variant="outline" asChild>
              <Link href="/dashboards">
                <ArrowLeft className="size-4" />
                All dashboards
              </Link>
            </Button>
          }
        />
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Could not load the dashboard</AlertTitle>
          <AlertDescription>
            <p>{getErrorMessage(dashboardQuery.error)}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void dashboardQuery.refetch()}
            >
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!draft || !saved) {
    return <Skeleton className="h-96 w-full" />;
  }

  const atLimit = draft.widgets.length >= MAX_WIDGETS;

  return (
    <div className="space-y-6">
      <PageHeader
        title={draft.name.trim() || "Untitled dashboard"}
        description={`Version ${saved.version} · ${draft.widgets.length} of ${MAX_WIDGETS} widgets. Layout and filters are saved together; a chart is a spec, not a renderer option.`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/dashboards">
                <ArrowLeft className="size-4" />
                All dashboards
              </Link>
            </Button>
            <Button
              onClick={() => void onSave()}
              disabled={!dirty || saveMutation.isPending}
            >
              <Save className="size-4" />
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      />

      {conflict ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>This dashboard changed elsewhere</AlertTitle>
          <AlertDescription>
            <p>{conflict}</p>
            <p className="mt-1 text-xs">
              Your unsaved changes are still on screen. Reload to continue from
              the newest saved version.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void onReload()}
            >
              <RefreshCw className="size-4" />
              Reload the saved dashboard
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {batch.error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>The widgets could not be executed</AlertTitle>
          <AlertDescription>
            {getErrorMessage(batch.error)}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="dashboard-name">Name</Label>
          <Input
            id="dashboard-name"
            className="w-64"
            maxLength={120}
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </div>

        {dirty ? (
          <Badge variant="outline">Unsaved changes</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">All changes saved</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setDialog({ mode: "add" })}
            disabled={!graph || atLimit}
            title={
              atLimit
                ? `A dashboard holds at most ${MAX_WIDGETS} widgets.`
                : undefined
            }
          >
            <Plus className="size-4" />
            Add widget
          </Button>
        </div>
      </div>

      {graph ? (
        <DashboardFilterBar
          // A new saved version means the document was replaced (save or
          // reload), so the bar should start from the new filters.
          key={saved.version}
          graph={graph}
          filters={draft.filters}
          onChange={(filters) => setDraft({ ...draft, filters })}
          warnings={batch.data?.warnings}
        />
      ) : modelQuery.isPending || metadataQuery.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <Alert>
          <AlertCircle />
          <AlertTitle>No semantic model</AlertTitle>
          <AlertDescription>
            Filters and new widgets need a saved semantic model. Existing
            widgets still run.
          </AlertDescription>
        </Alert>
      )}

      {draft.widgets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <LayoutDashboard className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">This canvas is empty</p>
            <p className="text-sm text-muted-foreground">
              Add a chart from the semantic model, then drag and resize it.
            </p>
          </div>
          <Button
            onClick={() => setDialog({ mode: "add" })}
            disabled={!graph}
          >
            <Plus className="size-4" />
            Add the first widget
          </Button>
        </div>
      ) : (
        <DashboardGrid
          widgets={draft.widgets}
          onLayoutChange={handleLayoutChange}
          renderWidget={renderWidget}
        />
      )}

      {graph && dialog ? (
        <WidgetDialog
          key={dialog.mode === "edit" ? dialog.widgetId : "new-widget"}
          graph={graph}
          initial={editingWidget?.chart}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          onSave={applyWidgetChart}
        />
      ) : null}
    </div>
  );
}
