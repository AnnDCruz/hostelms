"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationCategory } from "@prisma/client";
import { apiFetch } from "@/lib/api-client";
import type { NotificationPage } from "@/lib/types";

export type CategoryFilter = NotificationCategory | "All";

export const notificationKeys = {
  all: ["notifications"] as const,
  count: ["notifications", "count"] as const,
  list: (category: CategoryFilter) => ["notifications", "list", category] as const,
};

// Polls while the tab is visible. (Supabase Realtime is reserved for laundry.)
export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.count,
    queryFn: () => apiFetch<{ unread: number }>("/api/notifications/count"),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useNotifications(category: CategoryFilter, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(category),
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ limit: "15" });
      if (category !== "All") p.set("category", category);
      if (pageParam) p.set("cursor", pageParam);
      return apiFetch<NotificationPage>(`/api/notifications?${p}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    staleTime: 0,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notifications/${id}`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (category: CategoryFilter) =>
      apiFetch("/api/notifications/read-all", { method: "POST", body: JSON.stringify(category === "All" ? {} : { category }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
