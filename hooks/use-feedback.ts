"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { FeedbackDTO } from "@/lib/types";

export const feedbackKeys = { all: ["feedback"] as const };

export function useFeedbackList() {
  return useQuery({ queryKey: feedbackKeys.all, queryFn: () => apiFetch<FeedbackDTO[]>("/api/feedback") });
}

export function useSubmitFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string }) => apiFetch("/api/feedback", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: feedbackKeys.all }),
  });
}

export function useFeedbackAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: "acknowledge" | "review" | "resolve" | "escalate"; note?: string }) =>
      apiFetch(`/api/feedback/${id}`, { method: "PATCH", body: JSON.stringify({ action, note }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: feedbackKeys.all }),
  });
}
