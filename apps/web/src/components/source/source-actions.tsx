import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Loader2,
  PlugZap,
  RefreshCw,
} from "lucide-react";
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
import { getErrorCode, getErrorMessage } from "@/lib/api/client";
import type { SyncResult } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

interface SourceActionsProps {
  onTest: () => void;
  onSync: () => void;
  isTesting: boolean;
  isSyncing: boolean;
  syncResult?: SyncResult;
  syncError?: Error | null;
}

export function SourceActions({
  onTest,
  onSync,
  isTesting,
  isSyncing,
  syncResult,
  syncError,
}: SourceActionsProps) {
  const busy = isTesting || isSyncing;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
        <CardDescription>
          Test the connection, then discover the source schema.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={onTest} disabled={busy} variant="outline">
            {isTesting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PlugZap className="size-4" />
            )}
            {isTesting ? "Testing…" : "Test connection"}
          </Button>
          <Button onClick={onSync} disabled={busy}>
            {isSyncing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {isSyncing ? "Syncing…" : "Sync metadata"}
          </Button>
          {syncResult ? (
            <Button variant="ghost" asChild>
              <Link href="/metadata">
                Browse metadata
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Sync is synchronous in v0. The button stays busy until the new
          snapshot is stored; the Last sync card polls while it runs.
        </p>

        {syncError ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Sync failed</AlertTitle>
            <AlertDescription>
              <p>{getErrorMessage(syncError)}</p>
              {getErrorCode(syncError) ? (
                <Badge variant="outline" className="mt-2">
                  {getErrorCode(syncError)}
                </Badge>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {syncResult ? (
          <div
            className="rounded-lg border bg-muted/30 p-3 text-sm"
            data-testid="sync-result"
          >
            <div className="flex items-center gap-2">
              <Badge variant="secondary">SUCCEEDED</Badge>
              <span className="text-muted-foreground">
                {formatDateTime(syncResult.finishedAt)}
              </span>
            </div>
            <p className="mt-2">
              {syncResult.counts.objects} objects · {syncResult.counts.columns}{" "}
              columns · {syncResult.counts.relations} relations across{" "}
              {syncResult.counts.schemas} schemas.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
