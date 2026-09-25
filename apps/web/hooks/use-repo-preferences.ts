"use client";

import useSWR from "swr";
import type {
  RepoPreferencesData,
  RepoPreferencesInput,
} from "@/lib/repo-preferences/schema";
import { fetcher } from "@/lib/swr";

interface RepoPreferencesListResponse {
  repositories: RepoPreferencesData[];
}

function repoPath(repoOwner: string, repoName: string): string {
  return `/api/settings/repo-preferences/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}`;
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof data?.error === "string" ? data.error : fallback;
}

export function useRepoPreferences() {
  const { data, error, isLoading, mutate } =
    useSWR<RepoPreferencesListResponse>(
      "/api/settings/repo-preferences",
      fetcher,
    );

  const saveRepoPreferences = async (
    repoOwner: string,
    repoName: string,
    settings: RepoPreferencesInput,
  ): Promise<RepoPreferencesData> => {
    const res = await fetch(repoPath(repoOwner, repoName), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!res.ok) {
      throw new Error(
        await readError(res, "Failed to save repository preferences"),
      );
    }
    const { repository } = (await res.json()) as {
      repository: RepoPreferencesData;
    };
    await mutate();
    return repository;
  };

  const deleteRepoPreferences = async (
    repoOwner: string,
    repoName: string,
  ): Promise<void> => {
    const res = await fetch(repoPath(repoOwner, repoName), {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(
        await readError(res, "Failed to delete repository preferences"),
      );
    }
    await mutate();
  };

  return {
    repositories: data?.repositories ?? [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    saveRepoPreferences,
    deleteRepoPreferences,
  };
}
