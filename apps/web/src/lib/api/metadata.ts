import { api, callApi } from "./client";
import type { MetadataSnapshot } from "./types";

export function getMetadata(): Promise<MetadataSnapshot> {
  return callApi(() => api.GET("/api/metadata"));
}
