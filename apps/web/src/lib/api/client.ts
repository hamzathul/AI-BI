import createClient from "openapi-fetch";
import type { paths } from "./schema";
import type { ApiErrorBody, ConnectorCode } from "./types";

/**
 * The API origin only. Swagger paths already include `/api`, so adding the
 * prefix here would duplicate it (D44).
 */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001"
).replace(/\/$/, "");

export const api = createClient<paths>({ baseUrl: API_BASE_URL });

/**
 * Every HTTP failure becomes this one error type, so UI code never branches on
 * fetch/openapi-fetch details (D29/D39).
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: ConnectorCode,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Partial<ApiErrorBody>;
  return (
    typeof candidate.statusCode === "number" &&
    typeof candidate.error === "string" &&
    (typeof candidate.message === "string" ||
      Array.isArray(candidate.message)) &&
    typeof candidate.path === "string" &&
    typeof candidate.timestamp === "string"
  );
}

export function toApiError(body: unknown, status: number): ApiError {
  if (isApiErrorBody(body)) {
    const message = Array.isArray(body.message)
      ? body.message.join("; ")
      : body.message;

    return new ApiError(message, status, body.code, body);
  }

  return new ApiError(
    status > 0
      ? `The API returned an unexpected ${status} response.`
      : `Cannot reach the API at ${API_BASE_URL}. Is core-api running?`,
    status,
    undefined,
    body,
  );
}

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/**
 * openapi-fetch returns `{ data, error }` rather than throwing. This turns that
 * into a promise that resolves with data or rejects with `ApiError`.
 */
export async function unwrap<T>(result: FetchResult<T>): Promise<T> {
  if (result.error !== undefined) {
    throw toApiError(result.error, result.response.status);
  }

  if (result.data === undefined) {
    throw new ApiError(
      "The API returned an empty response.",
      result.response.status,
    );
  }

  return result.data;
}

export async function callApi<T>(
  operation: () => Promise<FetchResult<T>>,
): Promise<T> {
  try {
    return await unwrap(await operation());
  } catch (error) {
    if (error instanceof ApiError) throw error;

    throw new ApiError(
      `Cannot reach the API at ${API_BASE_URL}. Is core-api running?`,
      0,
      undefined,
      error,
    );
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function getErrorCode(error: unknown): ConnectorCode | undefined {
  return error instanceof ApiError ? error.code : undefined;
}
