import { api, callApi } from "./client";
import type { ConnectionTest, SourceStatus, SyncResult } from "./types";

export function getSourceStatus(): Promise<SourceStatus> {
  return callApi(() => api.GET("/api/source"));
}

export function testSource(): Promise<ConnectionTest> {
  return callApi(() => api.POST("/api/source/test"));
}

export function runSync(): Promise<SyncResult> {
  return callApi(() => api.POST("/api/source/sync"));
}
