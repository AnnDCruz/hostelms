"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ShiftDTO, ShiftsDTO } from "@/lib/types";

export const shiftKeys = { all: ["shifts"] as const };

export type ShiftFilters = { blockId?: string; review?: boolean };

// Polled every 30s: the page also draws a live running time locally, so this only needs to catch shifts that
// another screen started, ended or flagged. Each call also gives the server a chance to flag forgotten logouts.
export function useShifts(filters: ShiftFilters = {}) {
  const params = new URLSearchParams();
  if (filters.blockId) params.set("blockId", filters.blockId);
  if (filters.review) params.set("review", "1");
  const qs = params.toString();

  return useQuery({
    queryKey: [...shiftKeys.all, filters.blockId ?? "all", filters.review ? "review" : "any"],
    queryFn: async () => {
      const data = await apiFetch<ShiftsDTO>(`/api/shifts${qs ? `?${qs}` : ""}`);
      return { ...data, clockOffsetMs: new Date(data.serverTime).getTime() - Date.now() };
    },
    refetchInterval: 30_000,
  });
}

export function useShiftMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: shiftKeys.all });

  return {
    start: useMutation({
      mutationFn: (blockId: string) => apiFetch<ShiftDTO>("/api/shifts/start", { method: "POST", body: JSON.stringify({ blockId }) }),
      onSettled: refresh,
    }),
    end: useMutation({
      mutationFn: () => apiFetch<ShiftDTO>("/api/shifts/end", { method: "POST" }),
      onSettled: refresh,
    }),
    resolve: useMutation({
      mutationFn: ({ id, shiftOut }: { id: string; shiftOut: string }) =>
        apiFetch<ShiftDTO>(`/api/shifts/${id}`, { method: "PATCH", body: JSON.stringify({ shiftOut }) }),
      onSettled: refresh,
    }),
  };
}
