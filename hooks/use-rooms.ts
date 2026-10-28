"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { RoomActionInput, RoomDTO, RoomHistoryDTO } from "@/lib/types";
import { blockKeys } from "./use-blocks";
import { studentKeys } from "./use-students";

export const roomKeys = {
  all: ["rooms"] as const,
  list: (blockId: string) => ["rooms", "list", blockId] as const,
  history: (roomId: string) => ["rooms", "history", roomId] as const,
};

export function useRooms(blockId: string | null) {
  return useQuery({
    queryKey: roomKeys.list(blockId ?? ""),
    queryFn: () => apiFetch<RoomDTO[]>(`/api/rooms?blockId=${blockId}`),
    enabled: !!blockId,
  });
}

export function useRoomHistory(roomId: string) {
  return useQuery({
    queryKey: roomKeys.history(roomId),
    queryFn: () => apiFetch<RoomHistoryDTO[]>(`/api/rooms/${roomId}`),
  });
}

export function useRoomAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, body }: { roomId: string; body: RoomActionInput }) =>
      apiFetch(`/api/rooms/${roomId}/action`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: roomKeys.all });
      qc.invalidateQueries({ queryKey: blockKeys.all });
      qc.invalidateQueries({ queryKey: studentKeys.all });
    },
  });
}

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { blockId: string; roomNumber: string; floor: number }) =>
      apiFetch("/api/rooms", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: roomKeys.all });
      qc.invalidateQueries({ queryKey: blockKeys.all });
    },
  });
}
