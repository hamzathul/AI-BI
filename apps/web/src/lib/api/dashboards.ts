import { ApiError, api, callApi, toApiError } from "./client";
import type { Dashboard, DashboardList, DashboardWrite } from "./types";

export function listDashboards(): Promise<DashboardList> {
  return callApi(() => api.GET("/api/dashboards"));
}

export function getDashboard(id: string): Promise<Dashboard> {
  return callApi(() => api.GET("/api/dashboards/{id}", { params: { path: { id } } }));
}

export function createDashboard(name: string): Promise<Dashboard> {
  return callApi(() => api.POST("/api/dashboards", { body: { name } }));
}

export function saveDashboard(
  id: string,
  document: DashboardWrite,
): Promise<Dashboard> {
  return callApi(() =>
    api.PUT("/api/dashboards/{id}", {
      params: { path: { id } },
      body: document,
    }),
  );
}

/** DELETE returns 204 with no body, so `callApi` cannot be used. */
export async function deleteDashboard(id: string): Promise<void> {
  const result = await api.DELETE("/api/dashboards/{id}", {
    params: { path: { id } },
  });

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
