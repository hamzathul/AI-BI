"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteSemanticModel,
  getSemanticExample,
  getSemanticModel,
  saveSemanticModel,
  validateSemanticModel,
} from "@/lib/api/semantic";
import { queryKeys } from "@/lib/query-keys";

export function useSemanticModel() {
  return useQuery({
    queryKey: queryKeys.semanticModel,
    queryFn: getSemanticModel,
  });
}

export function useSemanticExample() {
  return useMutation({
    mutationFn: getSemanticExample,
  });
}

export function useValidateSemanticModel() {
  return useMutation({
    mutationFn: validateSemanticModel,
  });
}

export function useSaveSemanticModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveSemanticModel,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.semanticModel,
      });
    },
  });
}

export function useDeleteSemanticModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSemanticModel,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.semanticModel,
      });
    },
  });
}
