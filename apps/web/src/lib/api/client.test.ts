import { describe, expect, it } from "vitest";
import {
  ApiError,
  callApi,
  getErrorCode,
  getErrorMessage,
  toApiError,
  unwrap,
} from "./client";

const envelope = {
  statusCode: 502,
  error: "Bad Gateway",
  message: "The source database rejected the credentials.",
  code: "AUTH" as const,
  path: "/api/source/test",
  timestamp: "2026-10-20T08:15:01.250Z",
};

describe("API error normalization", () => {
  it("uses the API envelope message and connector code", () => {
    const error = toApiError(envelope, 502);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe(envelope.message);
    expect(error.status).toBe(502);
    expect(error.code).toBe("AUTH");
    expect(getErrorMessage(error)).toBe(envelope.message);
    expect(getErrorCode(error)).toBe("AUTH");
  });

  it("joins validation message arrays", () => {
    const error = toApiError(
      { ...envelope, statusCode: 400, message: ["a is required", "b is bad"] },
      400,
    );

    expect(error.message).toBe("a is required; b is bad");
  });

  it("falls back to a safe message for unknown bodies", () => {
    const error = toApiError({ surprise: true }, 500);

    expect(error.message).toBe("The API returned an unexpected 500 response.");
    expect(error.code).toBeUndefined();
  });

  it("rejects when openapi-fetch returns an error", async () => {
    await expect(
      unwrap({
        error: envelope,
        response: new Response(null, { status: 502 }),
      }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      code: "AUTH",
    });
  });

  it("turns network failures into status 0", async () => {
    await expect(
      callApi(async () => {
        throw new TypeError("fetch failed");
      }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
    });
  });
});
