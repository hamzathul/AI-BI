/**
 * A small incremental SSE parser (6.4).
 *
 * We use `fetch` + a stream instead of `EventSource` because the question must
 * travel in a POST body, so the browser gives us raw chunks, not events. Chunks
 * can split anywhere (even inside `\r\n`), which is why this keeps a buffer and
 * only emits on a blank line.
 *
 * Comments (`: ping`) are ignored, `data:` lines are joined with `\n`, and an
 * unterminated trailing frame is discarded — the same behavior as the SSE spec.
 */

export interface SseFrame {
  /** Frame name, when the server sent `event:`. Unused by our contract. */
  event?: string;
  /** Joined `data:` lines. */
  data: string;
}

interface Separator {
  at: number;
  length: number;
}

function nextSeparator(buffer: string): Separator | null {
  const candidates: Separator[] = [];

  const crlf = buffer.indexOf("\r\n\r\n");
  if (crlf >= 0) candidates.push({ at: crlf, length: 4 });

  const lf = buffer.indexOf("\n\n");
  if (lf >= 0) candidates.push({ at: lf, length: 2 });

  const cr = buffer.indexOf("\r\r");
  if (cr >= 0) candidates.push({ at: cr, length: 2 });

  return candidates.sort((a, b) => a.at - b.at)[0] ?? null;
}

function parseFrame(raw: string): SseFrame | null {
  const data: string[] = [];
  let event: string | undefined;

  for (const line of raw.split(/\r\n|\n|\r/)) {
    if (!line || line.startsWith(":")) continue;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "data") data.push(value);
    else if (field === "event") event = value;
  }

  if (data.length === 0) return null;

  return event === undefined ? { data: data.join("\n") } : { event, data: data.join("\n") };
}

export interface SseParser {
  /** Feed a decoded chunk; returns every frame it completed. */
  push(chunk: string): SseFrame[];
}

export function createSseParser(): SseParser {
  let buffer = "";

  return {
    push(chunk: string): SseFrame[] {
      buffer += chunk;
      const frames: SseFrame[] = [];

      for (;;) {
        const separator = nextSeparator(buffer);
        if (!separator) break;

        const raw = buffer.slice(0, separator.at);
        buffer = buffer.slice(separator.at + separator.length);

        const frame = parseFrame(raw);
        if (frame) frames.push(frame);
      }

      return frames;
    },
  };
}
