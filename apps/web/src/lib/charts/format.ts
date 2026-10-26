import type { ChartFormat, DateStyle } from "@/lib/api/types";
import { isDateType, isNumericType } from "@/lib/type-family";

export { isDateType, isNumericType } from "@/lib/type-family";

/** Mirror of the compiler defaults: Postgres numerics arrive as strings. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Formatting is pinned to en-US so a chart looks the same on every machine and
 * tests are not locale-dependent. The API never stores formatted strings.
 * `percent` treats the stored value as a fraction (0.42 -> 42%).
 */
const LOCALE = "en-US";
export function formatNumber(
  value: unknown,
  format?: ChartFormat["number"],
): string {
  const parsed = toNumber(value);
  if (parsed === null) return "—";

  const style = format?.style ?? "plain";
  const maximumFractionDigits =
    format?.decimals ?? (style === "currency" ? 2 : style === "percent" ? 1 : 2);
  const minimumFractionDigits = style === "plain" ? 0 : maximumFractionDigits;

  if (style === "currency") {
    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency: format?.currency ?? "USD",
      maximumFractionDigits,
      minimumFractionDigits,
    }).format(parsed);
  }

  if (style === "percent") {
    return new Intl.NumberFormat(LOCALE, {
      style: "percent",
      maximumFractionDigits,
      minimumFractionDigits,
    }).format(parsed);
  }

  return new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits,
    minimumFractionDigits,
  }).format(parsed);
}

const DATE_PARTS = /^(\d{4})-(\d{2})-(\d{2})/;

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;

  const match = DATE_PARTS.exec(value);
  if (match) {
    // Build from parts so a plain calendar date is never shifted by a timezone.
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Display styles are semantic; the renderer chooses the actual format (D8). */
export function formatDate(value: unknown, style: DateStyle = "iso"): string {
  if (value === null || value === undefined) return "—";
  if (style === "iso") return String(value);

  const date = parseDate(value);
  if (!date) return String(value);

  return new Intl.DateTimeFormat(
    LOCALE,
    style === "month"
      ? { month: "short", timeZone: "UTC" }
      : { month: "short", year: "numeric", timeZone: "UTC" },
  ).format(date);
}

/** One cell, typed by the result column. Used by the table adapter. */
export function formatCell(
  value: unknown,
  dataType: string,
  format?: ChartFormat,
): string {
  if (value === null || value === undefined) return "—";
  if (isDateType(dataType)) return formatDate(value, format?.date?.style ?? "iso");
  if (isNumericType(dataType)) return formatNumber(value, format?.number);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);

  return String(value);
}
