import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  ShieldCheck,
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
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorCode, getErrorMessage } from "@/lib/api/client";
import type { ConnectionTest, LastSync, SourceStatus } from "@/lib/api/types";
import { formatDateTime, formatRelativeTime } from "@/lib/format";

interface SourceOverviewProps {
  status?: SourceStatus;
  isPending: boolean;
  error: Error | null;
  onRetry: () => void;
  testResult?: ConnectionTest;
  testError?: Error | null;
  isTesting?: boolean;
}

function SyncStatusBadge({ status }: { status: LastSync["status"] }) {
  if (status === "SUCCEEDED") {
    return (
      <Badge variant="secondary" data-testid="last-sync-status">
        <CheckCircle2 className="size-3" />
        {status}
      </Badge>
    );
  }

  if (status === "FAILED") {
    return (
      <Badge variant="destructive" data-testid="last-sync-status">
        <AlertCircle className="size-3" />
        {status}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" data-testid="last-sync-status">
      <Loader2 className="size-3 animate-spin" />
      {status}
    </Badge>
  );
}

function SourceError({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>Could not load the source status</AlertTitle>
      <AlertDescription>
        <p>{getErrorMessage(error)}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          <RefreshCw className="size-4" />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function ConnectionCard({
  result,
  error,
  isTesting,
}: {
  result?: ConnectionTest;
  error?: Error | null;
  isTesting?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connection</CardTitle>
        <CardDescription>Audited in this browser session.</CardDescription>
      </CardHeader>
      <CardContent>
        {isTesting ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Testing the source connection…
          </div>
        ) : error ? (
          <Alert variant="destructive" data-testid="test-error">
            <AlertCircle />
            <AlertTitle>Connection test failed</AlertTitle>
            <AlertDescription>
              <p>{getErrorMessage(error)}</p>
              {getErrorCode(error) ? (
                <Badge variant="outline" className="mt-2">
                  {getErrorCode(error)}
                </Badge>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : result ? (
          <div className="space-y-3" data-testid="connection-result">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Server</span>
              <span className="font-mono text-sm">{result.serverVersion}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Database</span>
              <span className="font-mono text-sm">{result.database}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Latency</span>
              <span className="text-sm">{result.latencyMs} ms</span>
            </div>
            <div className="flex items-center gap-2 border-t pt-3">
              {result.readOnly ? (
                <>
                  <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                  <Badge variant="secondary">Read-only role</Badge>
                </>
              ) : (
                <>
                  <AlertCircle className="size-4 text-destructive" />
                  <Badge variant="destructive">The role can write</Badge>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not tested in this session. Run a connection test to see the server
            version and read-only audit.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function SourceOverview({
  status,
  isPending,
  error,
  onRetry,
  testResult,
  testError,
  isTesting,
}: SourceOverviewProps) {
  if (isPending) {
    return (
      <div
        className="grid gap-4 lg:grid-cols-3"
        data-testid="source-overview-loading"
      >
        {[0, 1, 2].map((item) => (
          <Card key={item}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return <SourceError error={error} onRetry={onRetry} />;
  }

  if (!status) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>
            Read-only source from the environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Database</span>
            <span className="font-mono text-sm">
              {status.database ?? "Unknown"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Configured</span>
            {status.configured ? (
              <Badge variant="secondary">
                <CheckCircle2 className="size-3" />
                Yes
              </Badge>
            ) : (
              <Badge variant="outline">No</Badge>
            )}
          </div>
          <p className="border-t pt-3 text-xs text-muted-foreground">
            Host and credentials stay in the API. The browser only sees the
            database name.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Last sync</CardTitle>
          <CardDescription>
            The most recent attempt, successful or not.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status.lastSync ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Status</span>
                <SyncStatusBadge status={status.lastSync.status} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Started</span>
                <span className="text-sm" title={status.lastSync.startedAt}>
                  {formatRelativeTime(status.lastSync.startedAt)}
                </span>
              </div>
              {status.lastSync.finishedAt ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">
                    Finished
                  </span>
                  <span className="text-sm">
                    {formatDateTime(status.lastSync.finishedAt)}
                  </span>
                </div>
              ) : null}
              {status.lastSync.error ? (
                <p className="border-t pt-3 text-sm text-destructive">
                  {status.lastSync.error}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <Clock className="mt-0.5 size-4 shrink-0" />
              <p>No sync yet. Run one to create the first metadata snapshot.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <ConnectionCard
        result={testResult}
        error={testError}
        isTesting={isTesting}
      />
    </div>
  );
}
