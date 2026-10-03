"use client";

import useSWR from "swr";
import { getGitStatus, type SessionGitStatus } from "@/lib/git/queries/status";

export type { SessionGitStatus } from "@/lib/git/queries/status";

export interface UseSessionGitStatusReturn {
  gitStatus: SessionGitStatus | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<SessionGitStatus | null | undefined>;
}

export function useSessionGitStatus(
  sessionId: string,
  sandboxConnected: boolean,
): UseSessionGitStatusReturn {
  const key = sandboxConnected ? (["git-status", sessionId] as const) : null;

  // null means the sandbox is inactive or unreachable: no status, not an error.
  const { data, error, isLoading, mutate } = useSWR<SessionGitStatus | null>(
    key,
    async ([, id]: readonly [string, string]) =>
      getGitStatus({ sessionId: id }),
    {
      revalidateOnFocus: false,
      dedupingInterval: 1500,
    },
  );

  return {
    gitStatus: data ?? null,
    isLoading,
    error: error?.message ?? null,
    refresh: mutate,
  };
}
