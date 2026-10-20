import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MetadataRelation } from "@/lib/api/types";
import { columnKey, type IndexedObject } from "@/lib/metadata-index";

interface ColumnTableProps {
  object: IndexedObject;
  fkByColumn: Map<string, MetadataRelation[]>;
}

function foreignKeyLabel(
  object: IndexedObject,
  column: string,
  relations: MetadataRelation[],
): string {
  return relations
    .map((relation) => {
      if (
        relation.from.schema === object.schema &&
        relation.from.object === object.name &&
        relation.from.column === column
      ) {
        return `→ ${relation.to.schema}.${relation.to.object}.${relation.to.column}`;
      }

      return `← ${relation.from.schema}.${relation.from.object}.${relation.from.column}`;
    })
    .join(", ");
}

export function ColumnTable({ object, fkByColumn }: ColumnTableProps) {
  return (
    <Table>
      <caption className="sr-only">
        Columns of {object.schema}.{object.name}
      </caption>
      <TableHeader>
        <TableRow>
          <TableHead>Column</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Nullable</TableHead>
          <TableHead>Default</TableHead>
          <TableHead>Comment</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {object.columns.map((column) => {
          const relations =
            fkByColumn.get(
              columnKey(object.schema, object.name, column.name),
            ) ?? [];
          const fkLabel = foreignKeyLabel(object, column.name, relations);

          return (
            <TableRow key={column.id}>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{column.name}</span>
                  {column.isPrimaryKey ? (
                    <Badge variant="secondary" title="Primary key">
                      PK
                    </Badge>
                  ) : null}
                  {relations.length > 0 ? (
                    <Badge variant="outline" title={fkLabel}>
                      FK
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {column.dataType}
                </code>
              </TableCell>
              <TableCell>
                {column.nullable ? (
                  <Badge variant="outline">NULL</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    not null
                  </span>
                )}
              </TableCell>
              <TableCell>
                <code
                  className="block max-w-48 truncate font-mono text-xs text-muted-foreground"
                  title={column.defaultValue ?? undefined}
                >
                  {column.defaultValue ?? "—"}
                </code>
              </TableCell>
              <TableCell>
                <span
                  className="block max-w-56 truncate text-xs text-muted-foreground"
                  title={column.comment ?? undefined}
                >
                  {column.comment ?? "—"}
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
