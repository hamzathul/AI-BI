"use client";

import Link from "next/link";
import { AlertCircle, ArrowRight, RefreshCw, Table2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { MetadataBrowser } from "@/components/metadata/metadata-browser";
import { getErrorMessage } from "@/lib/api/client";
import { useMetadata } from "@/hooks/use-metadata";

function MetadataLoading() {
  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[0, 1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-9 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MetadataEmpty() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Table2 className="size-4 text-muted-foreground" />
          <CardTitle>No metadata yet</CardTitle>
        </div>
        <CardDescription>
          Sync the source database first. The browser will then show its
          schemas, tables, columns, and foreign keys.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href="/source">
            Go to the source page
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function MetadataPage() {
  const metadata = useMetadata();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Metadata"
        description="The stored snapshot of the configured source. Read-only: this page never changes the source database."
      />

      {metadata.isPending ? <MetadataLoading /> : null}

      {metadata.error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Could not load metadata</AlertTitle>
          <AlertDescription>
            <p>{getErrorMessage(metadata.error)}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void metadata.refetch()}
            >
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {metadata.data && metadata.data.schemas.length === 0 ? (
        <MetadataEmpty />
      ) : null}

      {metadata.data && metadata.data.schemas.length > 0 ? (
        <MetadataBrowser snapshot={metadata.data} />
      ) : null}
    </div>
  );
}
