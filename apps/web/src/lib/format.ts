const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}

export function formatRelativeTime(
  value: string | null | undefined,
  now = Date.now(),
): string {
  if (!value) return "—";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return value;

  const seconds = Math.round((timestamp - now) / 1000);
  const absolute = Math.abs(seconds);
  const past = seconds <= 0;

  if (absolute < 60) return past ? "just now" : "in a moment";

  const minutes = Math.round(absolute / 60);
  if (minutes < 60) return past ? `${minutes} min ago` : `in ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return past ? `${hours} hr ago` : `in ${hours} hr`;

  const days = Math.round(hours / 24);
  const unit = `day${days === 1 ? "" : "s"}`;
  return past ? `${days} ${unit} ago` : `in ${days} ${unit}`;
}
