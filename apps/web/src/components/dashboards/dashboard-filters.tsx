"use client";

import { useState } from "react";
import { CalendarRange, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardFilters } from "@/lib/api/types";
import type { SemanticGraph } from "@/lib/semantic-graph";

/** Radix Select cannot use "" as an item value. */
const NONE = "__none__";

interface DashboardFilterBarProps {
  graph: SemanticGraph;
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
  warnings?: string[];
}

function splitValues(value: string): string | string[] {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 1 ? parts : (parts[0] ?? "");
}

/**
 * Dashboard-level filters (5.7). They are part of the document, so the canvas
 * shows them as unsaved changes until the dashboard is saved. The server
 * rewrites each widget query; a widget that cannot reach the dimension keeps
 * running unfiltered and reports a warning.
 *
 * A filter is only written to the document once it has a value: the API rejects
 * an empty categorical value and an empty date range, so a half-filled row
 * stays local state instead of becoming an invalid document.
 */
export function DashboardFilterBar({
  graph,
  filters,
  onChange,
  warnings = [],
}: DashboardFilterBarProps) {
  const { dateRange, categorical } = filters;

  const dateDimensions = graph.dimensions.filter(
    (dimension) => dimension.isDate,
  );

  // A chosen dimension with no value yet lives here, not in the document: the
  // API rejects half-filled filters. Once a value arrives the document wins.
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const dateDimension = dateRange?.dimension ?? pendingDate ?? NONE;
  const categoryDimension = categorical?.dimension ?? pendingCategory ?? NONE;

  const hasFilters = dateRange !== undefined || categorical !== undefined;

  function withoutDateRange(): DashboardFilters {
    const { dateRange: _removed, ...rest } = filters;
    void _removed;
    return rest;
  }

  function withoutCategorical(): DashboardFilters {
    const { categorical: _removed, ...rest } = filters;
    void _removed;
    return rest;
  }

  function applyDateRange(from: string, to: string) {
    if (dateDimension === NONE) return;

    if (from && to && from > to) {
      setRangeError("The start date is after the end date.");
      return;
    }

    setRangeError(null);

    if (!from && !to) {
      onChange(withoutDateRange());
      return;
    }

    onChange({
      ...filters,
      dateRange: {
        dimension: dateDimension,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      },
    });
  }

  function applyCategory(value: string) {
    if (categoryDimension === NONE) return;

    const parsed = splitValues(value);

    if (parsed === "") {
      onChange(withoutCategorical());
      return;
    }

    onChange({
      ...filters,
      categorical: { dimension: categoryDimension, value: parsed },
    });
  }

  function changeDateDimension(value: string) {
    setRangeError(null);
    setPendingDate(value === NONE ? null : value);

    if (value === NONE) {
      onChange(withoutDateRange());
      return;
    }

    // No dates yet: keep the choice local until a date is entered.
    if (!dateRange) return;

    onChange({
      ...filters,
      dateRange: {
        dimension: value,
        ...(dateRange.from ? { from: dateRange.from } : {}),
        ...(dateRange.to ? { to: dateRange.to } : {}),
      },
    });
  }

  function changeCategoryDimension(value: string) {
    setPendingCategory(value === NONE ? null : value);

    if (value === NONE) {
      onChange(withoutCategorical());
      return;
    }

    if (!categorical) return;

    onChange({
      ...filters,
      categorical: { dimension: value, value: categorical.value },
    });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 pb-2 text-sm font-medium">
          <Filter className="size-4" />
          Filters
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={dateDimension} onValueChange={changeDateDimension}>
            <SelectTrigger aria-label="Date dimension" className="w-52">
              <CalendarRange className="size-4 text-muted-foreground" />
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No date filter</SelectItem>
              {dateDimensions.map((dimension) => (
                <SelectItem key={dimension.name} value={dimension.name}>
                  {dimension.name}
                  <span className="text-muted-foreground">
                    {" "}
                    · {dimension.dataset}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            aria-label="From date"
            type="date"
            className="w-40"
            disabled={dateDimension === NONE}
            value={dateRange?.from ?? ""}
            onChange={(event) =>
              applyDateRange(event.target.value, dateRange?.to ?? "")
            }
          />
          <Input
            aria-label="To date"
            type="date"
            className="w-40"
            disabled={dateDimension === NONE}
            value={dateRange?.to ?? ""}
            onChange={(event) =>
              applyDateRange(dateRange?.from ?? "", event.target.value)
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={categoryDimension}
            onValueChange={changeCategoryDimension}
          >
            <SelectTrigger aria-label="Category dimension" className="w-52">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No category filter</SelectItem>
              {graph.dimensions.map((dimension) => (
                <SelectItem key={dimension.name} value={dimension.name}>
                  {dimension.name}
                  <span className="text-muted-foreground">
                    {" "}
                    · {dimension.dataset}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            aria-label="Category value"
            className="w-56"
            placeholder="Value, or a, b, c"
            disabled={categoryDimension === NONE}
            value={
              Array.isArray(categorical?.value)
                ? categorical.value.join(", ")
                : categorical?.value ?? ""
            }
            onChange={(event) => applyCategory(event.target.value)}
          />
        </div>

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRangeError(null);
              setPendingDate(null);
              setPendingCategory(null);
              onChange({});
            }}
            className="mb-0.5"
          >
            <X className="size-4" />
            Clear
          </Button>
        ) : null}
      </div>

      {rangeError ? (
        <p className="text-xs text-destructive">{rangeError}</p>
      ) : null}

      {warnings.length > 0 ? (
        <ul className="space-y-1 text-xs text-amber-600 dark:text-amber-500">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
