"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ChartBuilder } from "@/components/charts/chart-builder";
import { ChartView } from "@/components/charts/chart-view";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMetadata } from "@/hooks/use-metadata";
import { useSemanticModel } from "@/hooks/use-semantic-model";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getErrorMessage } from "@/lib/api/client";
import { executeCharts } from "@/lib/api/charts";
import type { ChartSpec } from "@/lib/api/types";
import { defaultDraft, draftToChart, type ChartDraft } from "@/lib/charts/draft";
import { buildSemanticGraph } from "@/lib/semantic-graph";

/** Any valid UUID works: the preview only needs to correlate one result. */
const PREVIEW_ID = "11111111-1111-4111-8111-111111111111";

export default function ExplorePage() {
  const modelQuery = useSemanticModel();
  const metadataQuery = useMetadata();

  const graph = useMemo(
    () =>
      modelQuery.data?.model
        ? buildSemanticGraph(modelQuery.data.model, metadataQuery.data)
        : null,
    [modelQuery.data, metadataQuery.data],
  );

  // The form starts from the model's first metric. It only becomes state once
  // the user edits it, so no effect is needed to seed it.
  const [draft, setDraft] = useState<ChartDraft | null>(null);
  const form = draft ?? (graph ? defaultDraft(graph) : null);

  const build = graph && form ? draftToChart(form, graph) : null;
  const chart: ChartSpec | undefined =
    build && "chart" in build ? build.chart : undefined;
  const debouncedChart = useDebouncedValue(chart, 350);

  const previewQuery = useQuery({
    queryKey: ["chart-preview", debouncedChart],
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
    <div className="space-y-6">
      <PageHeader
        title="Explore"
        description="Build one chart from the semantic model. The chart is a spec — query, encodings, and formats — so it renders the same here and on a dashboard."
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboards">
              <BarChart3 className="size-4" />
              Dashboards
            </Link>
          </Button>
        }
      />

      {modelQuery.isPending ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      ) : null}

      {modelQuery.error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Could not load the semantic model</AlertTitle>
          <AlertDescription>{getErrorMessage(modelQuery.error)}</AlertDescription>
        </Alert>
      ) : null}

      {modelQuery.data && !modelQuery.data.model ? (
        <Alert>
          <AlertCircle />
          <AlertTitle>No semantic model yet</AlertTitle>
          <AlertDescription>
            <p>
              Charts need datasets, metrics, and dimensions. Save a model on the
              semantic page first.
            </p>
            <Button className="mt-3" size="sm" asChild>
              <Link href="/semantic">Open the semantic model</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {graph && form ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Chart</CardTitle>
              <CardDescription>
                Queries run against the saved semantic model with read-only
                credentials. No SQL is written here — the server compiles a
                QuerySpec.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartBuilder graph={graph} draft={form} onChange={setDraft} />
              {build && "error" in build ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  {build.error}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>{chart?.title ?? "Preview"}</CardTitle>
                <CardDescription>
                  {preview
                    ? `${preview.result?.rowCount ?? 0} row(s) in ${preview.result?.durationMs ?? 0} ms`
                    : "Waiting for a complete chart."}
                </CardDescription>
              </div>
              {chart ? <Badge variant="secondary">{chart.type}</Badge> : null}
            </CardHeader>
            <CardContent>
              {chart ? (
                <ChartView
                  chart={chart}
                  result={preview?.result}
                  error={previewError}
                  height={340}
                />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                  Complete the form to see a preview.
                </div>
              )}
              {preview?.warnings.length ? (
                <p className="mt-3 text-xs text-amber-600">
                  {preview.warnings.join(" ")}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
