"use client";

import type { ChatQueryResult } from "@/lib/chat/events";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Result cells arrive as JSON scalars; `null` is the only missing value. */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * The rows behind an answer. This is a preview, not an export: ai-service caps
 * the payload at 100 rows while `rowCount` stays the true count (D62), so the
 * caption says how many of how many are shown.
 */
export function AnswerTable({ result }: { result: ChatQueryResult }) {
  if (result.rowCount === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
        No rows matched that question.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="max-h-80 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {result.columns.map((column) => (
                <TableHead key={column.name}>{column.name}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {result.columns.map((column) => (
                  <TableCell key={column.name}>
                    {formatCell(row[column.name])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Showing {result.rows.length} of {result.rowCount} row(s) ·{" "}
        {result.durationMs} ms
        {result.truncated
          ? " · the source returned more rows than the query limit"
          : ""}
      </p>
    </div>
  );
}
