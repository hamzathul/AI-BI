"use client";

import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { SourceActions } from "@/components/source/source-actions";
import { SourceOverview } from "@/components/source/source-overview";
import { getErrorMessage } from "@/lib/api/client";
import { useRunSync, useTestSource } from "@/hooks/use-source-mutations";
import { useSourceStatus } from "@/hooks/use-source-status";

export default function SourcePage() {
  const sync = useRunSync();
  const test = useTestSource();
  const source = useSourceStatus(sync.isPending ? 1500 : false);

  function handleTest() {
    test.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(
          result.readOnly
            ? `Connected to ${result.database}. The role is read-only.`
            : `Connected to ${result.database}, but the role can write.`,
        );
      },
      onError: (error) => {
        toast.error(getErrorMessage(error));
      },
    });
  }

  function handleSync() {
    sync.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(
          `Synced ${result.counts.objects} objects and ${result.counts.columns} columns.`,
        );
      },
      onError: (error) => {
        toast.error(getErrorMessage(error));
      },
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Source database"
        description="The read-only PostgreSQL database configured for this deployment. Test it, then sync its schema into the app."
      />

      <SourceOverview
        status={source.data}
        isPending={source.isPending}
        error={source.error}
        onRetry={() => void source.refetch()}
        testResult={test.data}
        testError={test.error}
        isTesting={test.isPending}
      />

      <SourceActions
        onTest={handleTest}
        onSync={handleSync}
        isTesting={test.isPending}
        isSyncing={sync.isPending}
        syncResult={sync.data}
        syncError={sync.error}
      />
    </div>
  );
}
