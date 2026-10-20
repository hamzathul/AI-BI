"use client";

import { useMemo, useState } from "react";
import { Database, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MetadataSnapshot } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { buildMetadataIndex, type IndexedObject } from "@/lib/metadata-index";
import { ColumnTable } from "./column-table";
import { RelationsPanel } from "./relations-panel";

interface MetadataBrowserProps {
  snapshot: MetadataSnapshot;
}

function ObjectButton({
  object,
  selected,
  onSelect,
}: {
  object: IndexedObject;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${object.schema}.${object.name}`}
      aria-pressed={selected}
      title={`${object.schema}.${object.name}`}
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
        selected
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Table2 className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium">{object.name}</span>
      {object.kind === "VIEW" ? (
        <Badge variant="outline" className="text-[0.65rem]">
          VIEW
        </Badge>
      ) : null}
      <span className="text-xs tabular-nums">{object.columnCount}</span>
    </button>
  );
}

export function MetadataBrowser({ snapshot }: MetadataBrowserProps) {
  const index = useMemo(() => buildMetadataIndex(snapshot), [snapshot]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Start on a table, not a view: views usually have no primary key or FKs and
  // make a confusing first impression.
  const defaultObject =
    index.objects.find((object) => object.kind === "TABLE") ?? index.objects[0];
  const selected =
    index.objects.find((object) => object.key === selectedKey) ?? defaultObject;
  const relations = selected
    ? (index.relationsByObject.get(selected.key) ?? {
        outgoing: [],
        incoming: [],
      })
    : { outgoing: [], incoming: [] };

  if (!selected) return null;

  return (
    <div className="space-y-4" data-testid="metadata-browser">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>
          {index.counts.schemas} schemas · {index.counts.objects} objects ·{" "}
          {index.counts.columns} columns · {index.counts.relations} relations
        </span>
        <span className="hidden text-border sm:inline">|</span>
        <span>Snapshot from {formatDateTime(snapshot.syncedAt)}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit lg:sticky lg:top-8">
          <CardHeader>
            <CardTitle>Schemas</CardTitle>
            <CardDescription>Select a table or view.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {index.schemas.map((schema) => (
              <div key={schema.name} className="space-y-1">
                <div className="flex items-center gap-1.5 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <Database className="size-3" />
                  {schema.name}
                </div>
                {schema.objects.map((object) => (
                  <ObjectButton
                    key={object.key}
                    object={object}
                    selected={object.key === selected.key}
                    onSelect={() => setSelectedKey(object.key)}
                  />
                ))}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="font-mono text-lg">
                  {selected.schema}.{selected.name}
                </CardTitle>
                <Badge variant="outline">{selected.kind}</Badge>
              </div>
              <CardDescription>
                {selected.columnCount} columns ·{" "}
                {selected.primaryKey.length > 0
                  ? `PK: ${selected.primaryKey.join(", ")}`
                  : "No primary key"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ColumnTable object={selected} fkByColumn={index.fkByColumn} />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <RelationsPanel object={selected} relations={relations} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
