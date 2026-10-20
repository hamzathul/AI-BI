import { ArrowLeft, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  MetadataRelation,
  MetadataRelationEndpoint,
} from "@/lib/api/types";
import type { IndexedObject, ObjectRelations } from "@/lib/metadata-index";

interface RelationsPanelProps {
  object: IndexedObject;
  relations: ObjectRelations;
}

function endpointLabel(endpoint: MetadataRelationEndpoint): string {
  return `${endpoint.schema}.${endpoint.object}.${endpoint.column}`;
}

function RelationRow({
  direction,
  relation,
  object,
}: {
  direction: "outgoing" | "incoming";
  relation: MetadataRelation;
  object: IndexedObject;
}) {
  const outgoing = direction === "outgoing";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-2 text-xs">
      <Badge variant="outline">{relation.name}</Badge>
      <span className="font-mono">
        {outgoing
          ? `${object.schema}.${object.name}.${relation.from.column}`
          : endpointLabel(relation.from)}
      </span>
      {outgoing ? (
        <ArrowRight className="size-3 text-muted-foreground" />
      ) : (
        <ArrowLeft className="size-3 text-muted-foreground" />
      )}
      <span className="font-mono">
        {outgoing
          ? endpointLabel(relation.to)
          : `${object.schema}.${object.name}.${relation.to.column}`}
      </span>
    </div>
  );
}

export function RelationsPanel({ object, relations }: RelationsPanelProps) {
  const hasRelations =
    relations.outgoing.length > 0 || relations.incoming.length > 0;

  return (
    <section aria-labelledby="relations-heading" className="space-y-3">
      <div>
        <h3 id="relations-heading" className="text-sm font-medium">
          Relations
        </h3>
        <p className="text-xs text-muted-foreground">
          Foreign keys that leave or enter this table.
        </p>
      </div>

      {hasRelations ? (
        <div className="space-y-2">
          {relations.outgoing.map((relation) => (
            <RelationRow
              key={`out-${relation.id}`}
              direction="outgoing"
              relation={relation}
              object={object}
            />
          ))}
          {relations.incoming.map((relation) => (
            <RelationRow
              key={`in-${relation.id}`}
              direction="incoming"
              relation={relation}
              object={object}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No foreign keys touch this table.
        </p>
      )}
    </section>
  );
}
