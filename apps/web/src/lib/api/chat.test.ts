import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, ApiError } from "./client";
import { streamChat } from "./chat";
import type { ChatEvent } from "@/lib/chat/events";

const STEP =
  'data: {"type":"step","step":"classify_intent","status":"done","detail":{"intent":"data_question"}}\n\n';
const ANSWER =
  'data: {"type":"answer","question":"Headcount?","outcome":"answered","answer":"Two departments."}\n\n';

const encoder = new TextEncoder();

function sseResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function collect() {
  const events: ChatEvent[] = [];
  return { events, onEvent: (event: ChatEvent) => events.push(event) };
}

function stubFetch() {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamChat", () => {
  it("posts the message and emits frames in order", async () => {
    const fetchMock = stubFetch().mockResolvedValue(sseResponse([STEP, ANSWER]));
    const { events, onEvent } = collect();

    await streamChat("Headcount?", { onEvent });

    expect(events.map((event) => event.type)).toEqual(["step", "answer"]);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/chat`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    });
    expect(JSON.parse(init.body as string)).toEqual({ message: "Headcount?" });
  });

  it("decodes a multi-byte character split across chunks", async () => {
    const frame =
      'data: {"type":"answer","question":"q","outcome":"answered","answer":"héllo 🙂"}\n\n';
    const bytes = encoder.encode(frame);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // One byte per chunk: the most hostile split for TextDecoder.
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    stubFetch().mockResolvedValue(new Response(stream, { status: 200 }));
    const { events, onEvent } = collect();

    await streamChat("q", { onEvent });

    expect(events).toEqual([
      {
        type: "answer",
        question: "q",
        outcome: "answered",
        answer: "héllo 🙂",
      },
    ]);
  });

  it("ignores unknown frames and resolves when the stream ends", async () => {
    stubFetch().mockResolvedValue(
      sseResponse(['data: {"type":"future","payload":1}\n\n', "not json\n\n"]),
    );
    const { events, onEvent } = collect();

    await expect(streamChat("q", { onEvent })).resolves.toBeUndefined();
    expect(events).toEqual([]);
  });

  it("normalises an HTTP error into ApiError", async () => {
    const body = {
      statusCode: 400,
      error: "Bad Request",
      message: "message must not be empty",
      path: "/api/chat",
      timestamp: "2026-11-01T10:00:00.000Z",
    };
    stubFetch().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    const { onEvent } = collect();

    await expect(streamChat("", { onEvent })).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      message: "message must not be empty",
    });
  });

  it("reports an unreachable API as status 0", async () => {
    stubFetch().mockRejectedValue(new TypeError("fetch failed"));
    const { onEvent } = collect();

    const promise = streamChat("q", { onEvent });

    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ status: 0 });
    await expect(promise).rejects.toThrow(/Cannot reach the API/);
  });

  it("lets an abort through untouched for the caller to render as Stop", async () => {
    const controller = new AbortController();
    controller.abort();
    stubFetch().mockRejectedValue(new DOMException("Aborted", "AbortError"));
    const { onEvent } = collect();

    await expect(
      streamChat("q", { signal: controller.signal, onEvent }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects a 200 response with no body", async () => {
    stubFetch().mockResolvedValue(new Response(null, { status: 200 }));
    const { onEvent } = collect();

    await expect(streamChat("q", { onEvent })).rejects.toMatchObject({
      name: "ApiError",
      message: "The API returned an empty stream.",
    });
  });
});
