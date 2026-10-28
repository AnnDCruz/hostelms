"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { LaundryDTO } from "@/lib/types";

export const laundryKeys = { all: ["laundry"] as const };

// The server advances timers and returns fresh state on each call. Polling every few seconds keeps every
// student's machine list and the feed current; the second-by-second countdown is drawn locally from the
// server timestamps, so it does not need a request per second.
// Supabase Realtime can replace the polling later: subscribe to Machine, LaundrySession and LaundryFeedEntry
// changes and call queryClient.invalidateQueries({ queryKey: laundryKeys.all }) instead of refetchInterval.
export const LAUNDRY_POLL_MS = 5_000;

export function useLaundry() {
  return useQuery({
    queryKey: laundryKeys.all,
    queryFn: async () => {
      const data = await apiFetch<LaundryDTO>("/api/laundry");
      // How far this device's clock is from the server's, so countdowns are right even on a wrong clock.
      return { ...data, clockOffsetMs: new Date(data.serverTime).getTime() - Date.now() };
    },
    refetchInterval: LAUNDRY_POLL_MS,
  });
}

export function useLaundryMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: laundryKeys.all });
  const post = (url: string, body?: unknown) => apiFetch(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

  return {
    start: useMutation({
      mutationFn: ({ id, durationMinutes }: { id: string; durationMinutes: number }) => post(`/api/laundry/machines/${id}/start`, { durationMinutes }),
      onSettled: refresh,
    }),
    restart: useMutation({
      mutationFn: ({ id, durationMinutes }: { id: string; durationMinutes: number }) => post(`/api/laundry/machines/${id}/restart`, { durationMinutes }),
      onSettled: refresh,
    }),
    empty: useMutation({
      mutationFn: ({ id }: { id: string }) => post(`/api/laundry/machines/${id}/empty`),
      onSettled: refresh,
    }),
    maintenance: useMutation({
      mutationFn: ({ id, maintenance }: { id: string; maintenance: boolean }) =>
        apiFetch(`/api/laundry/machines/${id}/maintenance`, { method: "PATCH", body: JSON.stringify({ maintenance }) }),
      onSettled: refresh,
    }),
    config: useMutation({
      mutationFn: ({ roomId, washers, dryers }: { roomId: string; washers: number; dryers: number }) =>
        apiFetch(`/api/laundry/rooms/${roomId}/config`, { method: "PUT", body: JSON.stringify({ washers, dryers }) }),
      onSettled: refresh,
    }),
  };
}
