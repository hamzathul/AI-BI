import { describe, expect, it } from "vitest";
import { createSseParser } from "./sse";

const STEP =
  'data: {"type":"step","step":"draft_spec","status":"done","detail":{}}\n\n';
const ANSWER =
  'data: {"type":"answer","question":"q","outcome":"answered","answer":"a"}\n\n';

describe("createSseParser", () => {
  it("returns complete frames and keeps the remainder buffered", () => {
    const parser = createSseParser();

    expect(parser.push(STEP.slice(0, 20))).toEqual([]);
    expect(parser.push(STEP.slice(20) + ANSWER.slice(0, 10))).toEqual([
      {
        data: '{"type":"step","step":"draft_spec","status":"done","detail":{}}',
      },
    ]);
    expect(parser.push(ANSWER.slice(10))).toEqual([
      { data: '{"type":"answer","question":"q","outcome":"answered","answer":"a"}' },
    ]);
  });

  it("emits every frame in one chunk, in order", () => {
    const parser = createSseParser();

    const frames = parser.push(STEP + ANSWER);

    expect(frames.map((frame) => JSON.parse(frame.data).type)).toEqual([
      "step",
      "answer",
    ]);
  });

  it("handles CRLF frames split between \\r and \\n", () => {
    const parser = createSseParser();
    const crlf = STEP.replace(/\n/g, "\r\n");
    const split = crlf.indexOf("\r\n\r\n") + 3;

    expect(parser.push(crlf.slice(0, split))).toEqual([]);
    expect(parser.push(crlf.slice(split))).toHaveLength(1);
  });

  it("ignores comments and reads the event name", () => {
    const parser = createSseParser();

    const frames = parser.push(": keep-alive\n\nevent: answer\ndata: hi\n\n");

    expect(frames).toEqual([{ event: "answer", data: "hi" }]);
  });

  it("joins multi-line data with a newline", () => {
    const parser = createSseParser();

    expect(parser.push("data: line one\ndata: line two\n\n")).toEqual([
      { data: "line one\nline two" },
    ]);
  });

  it("drops an unterminated trailing frame", () => {
    const parser = createSseParser();

    expect(parser.push("data: never finished")).toEqual([]);
  });

  it("skips a frame that has no data field", () => {
    const parser = createSseParser();

    expect(parser.push("event: ping\n\n")).toEqual([]);
  });
});
