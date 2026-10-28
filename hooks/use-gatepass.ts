"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { GatepassDTO } from "@/lib/types";

export const gatepassKeys = { all: ["gatepasses"] as const };

export function useGatepasses() {
  return useQuery({
    queryKey: gatepassKeys.all,
    queryFn: () => apiFetch<GatepassDTO[]>("/api/gatepass"),
  });
}

export function useCreateGatepass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { departureTime: string; expectedReturnTime: string; reason: string }) =>
      apiFetch("/api/gatepass", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: gatepassKeys.all }),
  });
}

export function useGatepassAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      apiFetch(`/api/gatepass/${id}`, { method: "PATCH", body: JSON.stringify({ action }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: gatepassKeys.all }),
  });
}
