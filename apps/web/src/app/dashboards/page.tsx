"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, LayoutDashboard, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateDashboard,
  useDashboards,
  useDeleteDashboard,
} from "@/hooks/use-dashboards";
import { getErrorMessage } from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/format";

export default function DashboardsPage() {
  const listQuery = useDashboards();
  const createDashboard = useCreateDashboard();
  const deleteDashboard = useDeleteDashboard();
  const router = useRouter();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");

  async function onCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      const created = await createDashboard.mutateAsync(trimmed);
      setCreateOpen(false);
      setName("");
      router.push(`/dashboards/${created.id}`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function onDelete(id: string, dashboardName: string) {
    try {
      await deleteDashboard.mutateAsync(id);
      toast.success(`Deleted “${dashboardName}”.`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboards"
        description="Saved canvases: a name, global filters, and up to 12 chart widgets arranged on a 12-column grid. Every save is versioned."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New dashboard
          </Button>
        }
      />

      {listQuery.error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Could not load dashboards</AlertTitle>
          <AlertDescription>
            <p>{getErrorMessage(listQuery.error)}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void listQuery.refetch()}
            >
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {listQuery.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : null}

      {listQuery.data?.dashboards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <LayoutDashboard className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No dashboards yet</p>
              <p className="text-sm text-muted-foreground">
                Create one, then add charts from the semantic model.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              New dashboard
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {listQuery.data?.dashboards.map((dashboard) => (
          <Card key={dashboard.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/dashboards/${dashboard.id}`}
                  className="hover:underline"
                >
                  <CardTitle>{dashboard.name}</CardTitle>
                </Link>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${dashboard.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete “{dashboard.name}”?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        The dashboard and its widgets are removed. Saved charts
                        are not recoverable.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => void onDelete(dashboard.id, dashboard.name)}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <CardDescription>
                {dashboard.widgetCount} widget
                {dashboard.widgetCount === 1 ? "" : "s"} · version{" "}
                {dashboard.version}
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Updated {formatRelativeTime(dashboard.updatedAt)}
              </span>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/dashboards/${dashboard.id}`}>Open</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New dashboard</DialogTitle>
            <DialogDescription>
              Start empty and add widgets from the saved semantic model.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dashboard-name">Name</Label>
            <Input
              id="dashboard-name"
              value={name}
              maxLength={120}
              placeholder="Revenue overview"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void onCreate();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void onCreate()}
              disabled={!name.trim() || createDashboard.isPending}
            >
              {createDashboard.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
