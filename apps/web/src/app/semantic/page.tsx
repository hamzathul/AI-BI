"use client";

import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SemanticWorkspace } from "@/components/semantic/semantic-workspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/api/client";
import { useSemanticModel } from "@/hooks/use-semantic-model";

export default function SemanticPage() {
  const modelQuery = useSemanticModel();
  const serverModel = modelQuery.data?.model ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Semantic model"
        description="The business layer between the source schema and every question: datasets, dimensions, metrics, and the FK joins that connect them."
        actions={
          <Button variant="outline" asChild>
            <Link href="/metadata">Browse metadata</Link>
          </Button>
        }
      />

      {modelQuery.error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Could not load the semantic model</AlertTitle>
          <AlertDescription>
            <p>{getErrorMessage(modelQuery.error)}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void modelQuery.refetch()}
            >
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {modelQuery.isPending ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-80" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-[34rem] w-full" />
          </CardContent>
        </Card>
      ) : null}

      {modelQuery.data ? (
        <SemanticWorkspace
          initialModel={serverModel}
          updatedAt={modelQuery.data.updatedAt}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>v0 rules</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Metrics and dimensions share one namespace and use
              lower_snake_case.
            </li>
            <li>
              A metric has an aggregation plus an optional column expression
              (for example <code>quantity * unit_price</code>).
            </li>
            <li>
              Joins follow a discovered FK from child to parent. Self-joins and
              composite FKs are rejected.
            </li>
            <li>
              A query uses metrics from one fact dataset; dimensions may come
              from any reachable parent dataset.
            </li>
            <li>
              Metric filters become <code>FILTER (WHERE ...)</code>, so
              &quot;headcount&quot; can mean active employees.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
