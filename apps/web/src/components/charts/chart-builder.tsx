"use client";

import type { ReactNode } from "react";
import type { SemanticGraph } from "@/lib/semantic-graph";
import {
  CHART_TYPE_OPTIONS,
  DATE_STYLE_OPTIONS,
  GRAIN_OPTIONS,
  NUMBER_STYLE_OPTIONS,
  type ChartDraft,
} from "@/lib/charts/draft";
import type { ChartType } from "@/lib/api/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Radix Select cannot use "" as an item value. */
const NONE = "__none__";

interface ChartBuilderProps {
  graph: SemanticGraph;
  draft: ChartDraft;
  onChange: (draft: ChartDraft) => void;
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Form-based chart builder. It edits a `ChartDraft`; `draftToChart` turns that
 * into a ChartSpec, so this component never constructs a query by hand.
 */
export function ChartBuilder({ graph, draft, onChange }: ChartBuilderProps) {
  const metric = graph.metrics.find((entry) => entry.name === draft.metric);
  const dimensions = metric ? graph.dimensionsFor(metric.dataset) : [];
  const dateDimensions = dimensions.filter((dimension) => dimension.isDate);

  const update = (patch: Partial<ChartDraft>) =>
    onChange({ ...draft, ...patch });

  const changeMetric = (name: string) => {
    const nextMetric = graph.metrics.find((entry) => entry.name === name);
    const reachable = nextMetric ? graph.dimensionsFor(nextMetric.dataset) : [];
    const dateDimension = reachable.find((dimension) => dimension.isDate);
    const category =
      reachable.find((dimension) => !dimension.isDate) ?? reachable[0];

    onChange({
      ...draft,
      metric: name,
      // The title usually starts as the metric name, so keep it in step until
      // the user has given the chart a title of their own.
      title:
        draft.title.trim() === "" || draft.title === draft.metric
          ? name
          : draft.title,
      dimension: category?.name ?? "",
      series: "",
      dateDimension: dateDimension?.name ?? "",
    });
  };

  const changeType = (type: ChartType) =>
    onChange({
      ...draft,
      type,
      series: "",
      ...(type === "kpi" ? { dimension: "", grain: "none" as const } : {}),
      ...(type !== "line" ? { grain: "none" as const } : {}),
    });

  const usesGrain = draft.type === "line" && draft.grain !== "none";
  const showsDimensions = draft.type !== "kpi";
  const seriesOptions = dimensions.filter(
    (dimension) =>
      dimension.name !== draft.dimension && dimension.name !== draft.dateDimension,
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Chart type">
        <Select
          value={draft.type}
          onValueChange={(value) => changeType(value as ChartType)}
        >
          <SelectTrigger aria-label="Chart type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHART_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Title" htmlFor="chart-title">
        <Input
          id="chart-title"
          value={draft.title}
          maxLength={120}
          onChange={(event) => update({ title: event.target.value })}
        />
      </Field>

      <Field
        label="Metric"
        hint={metric ? `Fact dataset: ${metric.dataset}` : "Choose a metric."}
      >
        <Select value={draft.metric} onValueChange={changeMetric}>
          <SelectTrigger aria-label="Metric">
            <SelectValue placeholder="Choose a metric" />
          </SelectTrigger>
          <SelectContent>
            {graph.metrics.map((entry) => (
              <SelectItem key={entry.name} value={entry.name}>
                {entry.name}
                <span className="text-muted-foreground"> · {entry.dataset}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {showsDimensions && !usesGrain ? (
        <Field
          label={draft.type === "table" ? "First column" : "X axis / category"}
          hint={
            draft.type === "table"
              ? "Table columns are the dimensions plus the metric."
              : undefined
          }
        >
          <Select
            value={draft.dimension || NONE}
            onValueChange={(value) =>
              update({ dimension: value === NONE ? "" : value })
            }
          >
            <SelectTrigger aria-label="Dimension">
              <SelectValue placeholder="Choose a dimension" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {dimensions.map((dimension) => (
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
        </Field>
      ) : null}

      {draft.type === "line" ? (
        <Field
          label="Time grain"
          hint={
            draft.grain === "none"
              ? "A grain groups by day, week, month, quarter, or year."
              : "The X axis becomes the grain date, sorted oldest first."
          }
        >
          <Select
            value={draft.grain}
            onValueChange={(value) =>
              update({
                grain: value as ChartDraft["grain"],
                dateDimension: draft.dateDimension || dateDimensions[0]?.name || "",
              })
            }
          >
            <SelectTrigger aria-label="Time grain">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRAIN_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      {usesGrain ? (
        <Field label="Date dimension">
          <Select
            value={draft.dateDimension || NONE}
            onValueChange={(value) =>
              update({ dateDimension: value === NONE ? "" : value })
            }
          >
            <SelectTrigger aria-label="Date dimension">
              <SelectValue placeholder="Choose a date dimension" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
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
        </Field>
      ) : null}

      {draft.type === "bar" || draft.type === "line" || draft.type === "table" ? (
        <Field
          label={draft.type === "table" ? "Second column (optional)" : "Series (optional)"}
          hint={
            draft.type === "table"
              ? undefined
              : "Splits the bars or lines by this dimension."
          }
        >
          <Select
            value={draft.series || NONE}
            onValueChange={(value) =>
              update({ series: value === NONE ? "" : value })
            }
          >
            <SelectTrigger aria-label="Series dimension">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {seriesOptions.map((dimension) => (
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
        </Field>
      ) : null}

      {draft.type === "bar" ? (
        <label className="flex items-center gap-2 self-end pb-1 text-sm">
          <Checkbox
            checked={draft.stacked}
            onCheckedChange={(checked) => update({ stacked: checked === true })}
          />
          Stack the series
        </label>
      ) : null}

      {draft.type === "line" ? (
        <div className="flex items-center gap-4 self-end pb-1">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={draft.smooth}
              onCheckedChange={(checked) => update({ smooth: checked === true })}
            />
            Smooth
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={draft.area}
              onCheckedChange={(checked) => update({ area: checked === true })}
            />
            Area
          </label>
        </div>
      ) : null}

      <Field label="Number format">
        <Select
          value={draft.numberStyle}
          onValueChange={(value) =>
            update({ numberStyle: value as ChartDraft["numberStyle"] })
          }
        >
          <SelectTrigger aria-label="Number format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NUMBER_STYLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {draft.numberStyle === "currency" ? (
        <Field label="Currency code" hint="ISO 4217, for example USD.">
          <Input
            aria-label="Currency code"
            value={draft.currency}
            maxLength={3}
            onChange={(event) =>
              update({ currency: event.target.value.toUpperCase() })
            }
          />
        </Field>
      ) : null}

      <Field label="Decimals" hint="0–4. Leave empty for the default.">
        <Input
          aria-label="Decimals"
          type="number"
          min={0}
          max={4}
          value={draft.decimals}
          onChange={(event) => update({ decimals: event.target.value })}
        />
      </Field>

      <Field label="Date display">
        <Select
          value={draft.dateStyle}
          onValueChange={(value) =>
            update({ dateStyle: value as ChartDraft["dateStyle"] })
          }
        >
          <SelectTrigger aria-label="Date display">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_STYLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}
