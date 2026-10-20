"use client";

import { useQuery } from "@tanstack/react-query";
import { getMetadata } from "@/lib/api/metadata";
import { queryKeys } from "@/lib/query-keys";

export function useMetadata() {
  return useQuery({
    queryKey: queryKeys.metadata,
    queryFn: getMetadata,
  });
}
