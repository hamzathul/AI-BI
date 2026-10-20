"use client";

import { useQuery } from "@tanstack/react-query";
import { getSourceStatus } from "@/lib/api/source";
import { queryKeys } from "@/lib/query-keys";

/**
 * `refetchInterval` is used while a sync POST is in flight, so the card can
 * show RUNNING. Sync itself is synchronous for v0 (D41/D46).
 */
export function useSourceStatus(refetchInterval: number | false = false) {
  return useQuery({
    queryKey: queryKeys.source,
    queryFn: getSourceStatus,
    refetchInterval,
  });
}
