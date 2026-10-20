"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runSync, testSource } from "@/lib/api/source";
import { queryKeys } from "@/lib/query-keys";

export function useTestSource() {
  return useMutation({
    mutationFn: testSource,
  });
}

export function useRunSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: runSync,
    onSuccess: () => {
      // A sync replaces the metadata snapshot and creates a new SyncRun.
      void queryClient.invalidateQueries({ queryKey: queryKeys.source });
      void queryClient.invalidateQueries({ queryKey: queryKeys.metadata });
    },
    onError: () => {
      // A failed sync still creates a FAILED run; show it immediately.
      void queryClient.invalidateQueries({ queryKey: queryKeys.source });
    },
  });
}
