"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { NoticeDTO, NoticeDetailDTO } from "@/lib/types";

export const noticeKeys = {
  all: ["notices"] as const,
  detail: (id: string) => ["notices", "detail", id] as const,
};

export function useNotices() {
  return useQuery({ queryKey: noticeKeys.all, queryFn: () => apiFetch<NoticeDTO[]>("/api/notices") });
}

export function useNotice(id: string) {
  return useQuery({ queryKey: noticeKeys.detail(id), queryFn: () => apiFetch<NoticeDetailDTO>(`/api/notices/${id}`) });
}

export function useCreateNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; body: string; blockIds: string[]; expiresAt: string | null }) =>
      apiFetch("/api/notices", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: noticeKeys.all }),
  });
}

export function useDeleteNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notices/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: noticeKeys.all }),
  });
}

export function usePostComment(noticeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; parentId?: string | null }) =>
      apiFetch(`/api/notices/${noticeId}/comments`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: noticeKeys.all }),
  });
}
