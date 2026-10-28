"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { BlockDTO } from "@/lib/types";

export const blockKeys = { all: ["blocks"] as const };

export function useBlocks() {
  return useQuery({ queryKey: blockKeys.all, queryFn: () => apiFetch<BlockDTO[]>("/api/blocks") });
}
