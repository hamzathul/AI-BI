import { API_BASE_URL, ApiError, toApiError } from "./client";
import type { ChatEvent } from "@/lib/chat/events";
import { parseChatEvent } from "@/lib/chat/events";
import { createSseParser } from "@/lib/chat/sse";

export interface StreamChatOptions {
  /** Aborts the request and the reader. The hook renders this as "Stopped". */
  signal?: AbortSignal;
  /** Called once per recognised SSE frame, in order. */
  onEvent: (event: ChatEvent) => void;
}

/**
 * `POST /api/chat`, read as an SSE stream (6.4).
 *
 * `EventSource` cannot send a POST body, so this owns the reading loop. It
 * reuses the SSE parser from `lib/chat/sse` and the shared `ApiError`, so chat
 * failures look like every other API failure to the UI.
 *
 * Resolves when the stream closes. Unknown frames are ignored; a missing final
 * answer is the reducer's problem, not this function's.
 */
export async function streamChat(
  message: string,
  { signal, onEvent }: StreamChatOptions,
): Promise<void> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ message }),
      signal,
    });
  } catch (error) {
    // An aborted fetch is the user pressing Stop, not an outage.
    if (signal?.aborted) throw error;

    throw new ApiError(
      `Cannot reach the API at ${API_BASE_URL}. Is core-api running?`,
      0,
      undefined,
      error,
    );
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }

    throw toApiError(body, response.status);
  }

  if (!response.body) {
    throw new ApiError("The API returned an empty stream.", response.status);
  }

  const reader = response.body.getReader();
  // `stream: true` keeps a multi-byte character split across chunks intact.
  const decoder = new TextDecoder();
  const parser = createSseParser();

  const consume = (frames: ReturnType<typeof parser.push>) => {
    for (const frame of frames) {
      const event = parseChatEvent(frame.data);
      if (event) onEvent(event);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) consume(parser.push(decoder.decode(value, { stream: true })));
    }

    const tail = decoder.decode();
    if (tail) consume(parser.push(tail));
  } finally {
    reader.releaseLock();
  }
}
