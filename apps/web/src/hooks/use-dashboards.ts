"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDashboard,
  deleteDashboard,
  getDashboard,
  listDashboards,
  saveDashboard,
} from "@/lib/api/dashboards";
import { queryKeys } from "@/lib/query-keys";
import type { DashboardWrite } from "@/lib/api/types";

export function useDashboards() {
  return useQuery({
    queryKey: queryKeys.dashboards,
    queryFn: listDashboards,
  });
}

export function useDashboard(id: string) {
  return useQuery({
    queryKey: queryKeys.dashboard(id),
    queryFn: () => getDashboard(id),
  });
}

export function useCreateDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createDashboard,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboards });
    },
  });
}

export function useSaveDashboard(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (document: DashboardWrite) => saveDashboard(id, document),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboards });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(id) });
    },
  });
}

export function useDeleteDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteDashboard,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboards });
    },
  });
}
