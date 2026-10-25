import { ApiError, api, callApi, toApiError } from "./client";
import type {
  SemanticExampleResponse,
  SemanticModel,
  SemanticModelResponse,
  SemanticValidationResult,
} from "./types";

export function getSemanticModel(): Promise<SemanticModelResponse> {
  return callApi(() => api.GET("/api/semantic/model"));
}

export function getSemanticExample(): Promise<SemanticExampleResponse> {
  return callApi(() => api.GET("/api/semantic/example"));
}

export function validateSemanticModel(
  model: SemanticModel,
): Promise<SemanticValidationResult> {
  return callApi(() =>
    api.POST("/api/semantic/model/validate", { body: model }),
  );
}

export function saveSemanticModel(
  model: SemanticModel,
): Promise<SemanticModelResponse> {
  return callApi(() => api.PUT("/api/semantic/model", { body: model }));
}

/**
 * DELETE returns 204 with no body, so `callApi`/`unwrap` (which expects data)
 * cannot be used here.
 */
export async function deleteSemanticModel(): Promise<void> {
  const result = await api.DELETE("/api/semantic/model");

  if (result.error !== undefined) {
    throw toApiError(result.error, result.response.status);
  }

  if (!result.response.ok) {
    throw new ApiError(
      `The API returned an unexpected ${result.response.status} response.`,
      result.response.status,
    );
  }
}
