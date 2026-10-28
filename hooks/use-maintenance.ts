"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { MaintenanceDTO } from "@/lib/types";

export const maintenanceKeys = { all: ["maintenance"] as const };

export function useMaintenance() {
  return useQuery({
    queryKey: maintenanceKeys.all,
    queryFn: () => apiFetch<MaintenanceDTO[]>("/api/maintenance"),
  });
}

export function useCreateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { description: string }) =>
      apiFetch("/api/maintenance", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: maintenanceKeys.all }),
  });
}

export function useMaintenanceAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "start" | "resolve" | "reopen" }) =>
      apiFetch(`/api/maintenance/${id}`, { method: "PATCH", body: JSON.stringify({ action }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: maintenanceKeys.all }),
  });
}
