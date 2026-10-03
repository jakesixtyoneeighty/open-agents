"use client";

import useSWR from "swr";
import { checkpointHistoryKey } from "@/lib/checkpoints/api";
import type { CheckpointListResponse } from "@/lib/checkpoints/types";
import { fetcherNoStore } from "@/lib/swr";

/**
 * Session change history read from the sandbox journals. Disabled while the
 * sandbox is not running: history lives in the sandbox filesystem.
 */
export function useCheckpointHistory(sessionId: string, enabled: boolean) {
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<CheckpointListResponse>(
      enabled ? checkpointHistoryKey(sessionId) : null,
      fetcherNoStore,
      { revalidateOnFocus: false, shouldRetryOnError: false },
    );
  return {
    history: data ?? null,
    error: error instanceof Error ? error : null,
    isLoading,
    isRefreshing: isValidating,
    refresh: mutate,
  };
}
