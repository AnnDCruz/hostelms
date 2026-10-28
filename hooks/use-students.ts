"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Gender } from "@prisma/client";
import { apiFetch } from "@/lib/api-client";
import type { MyProfileDTO, StudentDTO } from "@/lib/types";

export type StudentQuery = { search?: string; unallocated?: boolean; gender?: Gender };

// Every key starts with "students", so invalidating studentKeys.all refreshes all of them.
export const studentKeys = {
  all: ["students"] as const,
  list: (q: StudentQuery) => ["students", "list", q] as const,
  me: ["students", "me"] as const,
};

export function useStudents(q: StudentQuery, enabled = true) {
  const params = new URLSearchParams();
  if (q.search) params.set("search", q.search);
  if (q.unallocated) params.set("unallocated", "true");
  if (q.gender) params.set("gender", q.gender);
  return useQuery({
    queryKey: studentKeys.list(q),
    queryFn: () => apiFetch<StudentDTO[]>(`/api/students?${params}`),
    enabled,
  });
}

export function useCreateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      apiFetch<{ id: string; emailed: boolean }>("/api/students", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: studentKeys.all }),
  });
}

export function useUpdateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      apiFetch(`/api/students/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: studentKeys.all }),
  });
}

export function useInvite() {
  return useMutation({
    mutationFn: ({ id, target }: { id: string; target: "student" | "parent" | "both" }) =>
      apiFetch<{ emailed: boolean }>(`/api/students/${id}/invite`, { method: "POST", body: JSON.stringify({ target }) }),
  });
}

export function useMyProfile() {
  return useQuery({ queryKey: studentKeys.me, queryFn: () => apiFetch<MyProfileDTO>("/api/students/me") });
}
