"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChartBuilder } from "@/components/charts/chart-builder";
import { ChartView } from "@/components/charts/chart-view";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getErrorMessage } from "@/lib/api/client";
import { executeCharts } from "@/lib/api/charts";
import type { ChartSpec } from "@/lib/api/types";
import {
  defaultDraft,
  draftFromChart,
  draftToChart,
  type ChartDraft,
} from "@/lib/charts/draft";
import type { SemanticGraph } from "@/lib/semantic-graph";

const PREVIEW_ID = "22222222-2222-4222-8222-222222222222";

interface WidgetDialogProps {
  graph: SemanticGraph;
  /** The chart being edited; omitted when adding a widget. */
  initial?: ChartSpec;
  onOpenChange: (open: boolean) => void;
  onSave: (chart: ChartSpec) => void;
}

/**
 * Add/edit dialog. It edits only the chart; the canvas owns the widget id and
 * layout, so resizing a tile never goes through this form.
 *
 * The canvas mounts this only while the dialog is open (and keys it by widget),
 * so the form state can be initialised once instead of synced with an effect.
 */
export function WidgetDialog({
  graph,
  initial,
  onOpenChange,
  onSave,
}: WidgetDialogProps) {
  const [draft, setDraft] = useState<ChartDraft>(() =>
    initial ? draftFromChart(initial, graph) : defaultDraft(graph),
  );

  const build = draftToChart(draft, graph);
  const chart = "chart" in build ? build.chart : undefined;
  const debouncedChart = useDebouncedValue(chart, 350);

  const previewQuery = useQuery({
    queryKey: ["widget-preview", debouncedChart],
    queryFn: () =>
      executeCharts({
        charts: [{ id: PREVIEW_ID, chart: debouncedChart as ChartSpec }],
      }),
    enabled: debouncedChart !== undefined,
    retry: false,
    staleTime: 30_000,
  });

  const preview = previewQuery.data?.results[0];
  const previewError =
    preview?.error?.message ??
    (previewQuery.error ? getErrorMessage(previewQuery.error) : undefined);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit widget" : "Add widget"}</DialogTitle>
          <DialogDescription>
            Charts are renderer-agnostic specs. The dashboard stores the spec, not
            an ECharts option.
          </DialogDescription>
        </DialogHeader>

        <ChartBuilder graph={graph} draft={draft} onChange={setDraft} />

        {"error" in build ? (
          <p className="text-sm text-muted-foreground">{build.error}</p>
        ) : null}

        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">{chart?.title ?? "Preview"}</p>
            <p className="text-xs text-muted-foreground">
              {preview
                ? `${preview.result?.rowCount ?? 0} row(s)`
                : "Complete the form to preview"}
            </p>
          </div>
          {chart ? (
            <ChartView
              chart={chart}
              result={preview?.result}
              error={previewError}
              height={220}
            />
          ) : (
            <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              No preview yet.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!chart}
            onClick={() => {
              if (chart) onSave(chart);
            }}
          >
            {initial ? "Save widget" : "Add widget"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
