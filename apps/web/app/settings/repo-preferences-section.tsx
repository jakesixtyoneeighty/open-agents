"use client";

import { ChevronRight, FolderGit2, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useRepoPreferences } from "@/hooks/use-repo-preferences";
import {
  parseRepoCoordinates,
  type RepoCoordinates,
} from "@/lib/repo-preferences/parse-repo";
import {
  EMPTY_REPO_PREFERENCES,
  type RepoPreferencesData,
} from "@/lib/repo-preferences/schema";
import { cn } from "@/lib/utils";
import { RepoPreferencesEditor } from "./repo-preferences-editor";

function repoKey(repo: RepoCoordinates): string {
  return `${repo.repoOwner}/${repo.repoName}`;
}

function summarize(repo: RepoPreferencesData): string {
  const parts: string[] = [];
  if (repo.modelId) parts.push(repo.modelId);
  if (repo.skillRefs.length > 0) {
    parts.push(
      `${repo.skillRefs.length} skill${repo.skillRefs.length === 1 ? "" : "s"}`,
    );
  }
  if (repo.setupCommand) parts.push("setup");
  if (repo.checkCommand) parts.push("check");
  if (repo.instructions) parts.push("instructions");
  return parts.length > 0 ? parts.join(" · ") : "Account defaults";
}

export function RepoPreferencesSection() {
  const {
    repositories,
    loading,
    error,
    saveRepoPreferences,
    deleteRepoPreferences,
  } = useRepoPreferences();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [draftRepo, setDraftRepo] = useState<RepoCoordinates | null>(null);
  const [repoInput, setRepoInput] = useState("");
  const [repoInputError, setRepoInputError] = useState<string | null>(null);

  const startAdding = () => {
    const parsed = parseRepoCoordinates(repoInput);
    if (!parsed) {
      setRepoInputError("Enter a repository as owner/repo or a GitHub URL");
      return;
    }
    setRepoInputError(null);
    setRepoInput("");
    const key = repoKey(parsed);
    if (repositories.some((repo) => repoKey(repo) === key)) {
      setDraftRepo(null);
      setExpandedKey(key);
      return;
    }
    setDraftRepo(parsed);
    setExpandedKey(key);
  };

  const save = async (
    repo: RepoCoordinates,
    input: Parameters<typeof saveRepoPreferences>[2],
  ) => {
    const saved = await saveRepoPreferences(
      repo.repoOwner,
      repo.repoName,
      input,
    );
    if (draftRepo && repoKey(draftRepo) === repoKey(repo)) {
      setDraftRepo(null);
    }
    return saved;
  };

  const remove = async (repo: RepoCoordinates) => {
    await deleteRepoPreferences(repo.repoOwner, repo.repoName);
    setExpandedKey(null);
  };

  if (loading) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  const draftIsNew =
    draftRepo !== null &&
    !repositories.some((repo) => repoKey(repo) === repoKey(draftRepo));

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="repo-preferences-add">Add a repository</Label>
        <div className="flex gap-2">
          <Input
            id="repo-preferences-add"
            value={repoInput}
            onChange={(event) => setRepoInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                startAdding();
              }
            }}
            placeholder="owner/repo"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={repoInputError ? true : undefined}
          />
          <Button type="button" variant="outline" onClick={startAdding}>
            <Plus />
            Add
          </Button>
        </div>
        {repoInputError ? (
          <p className="text-xs text-destructive">{repoInputError}</p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {repositories.length === 0 && !draftIsNew ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/70 px-4 py-10 text-center">
          <FolderGit2 className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No repository preferences yet. Add a repository to save its model,
            skills, commands and instructions.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/60 rounded-lg border border-border/70">
          {draftIsNew && draftRepo ? (
            <div>
              <div className="flex items-center gap-2 px-3 py-3">
                <ChevronRight className="h-4 w-4 rotate-90 text-muted-foreground" />
                <span className="font-mono text-sm font-medium">
                  {repoKey(draftRepo)}
                </span>
                <span className="text-xs text-muted-foreground">Not saved</span>
              </div>
              <RepoPreferencesEditor
                key={repoKey(draftRepo)}
                repoOwner={draftRepo.repoOwner}
                repoName={draftRepo.repoName}
                initial={EMPTY_REPO_PREFERENCES}
                isSaved={false}
                onSave={(input) => save(draftRepo, input)}
                onDelete={async () => setDraftRepo(null)}
                onCancel={() => setDraftRepo(null)}
              />
            </div>
          ) : null}
          {repositories.map((repo) => {
            const key = repoKey(repo);
            const isExpanded = expandedKey === key;
            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => setExpandedKey(isExpanded ? null : key)}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-accent/50"
                >
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      isExpanded && "rotate-90",
                    )}
                  />
                  <span className="min-w-0 truncate font-mono text-sm font-medium">
                    {key}
                  </span>
                  <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
                    {summarize(repo)}
                  </span>
                </button>
                {isExpanded ? (
                  <RepoPreferencesEditor
                    key={key}
                    repoOwner={repo.repoOwner}
                    repoName={repo.repoName}
                    initial={repo}
                    isSaved
                    onSave={(input) => save(repo, input)}
                    onDelete={() => remove(repo)}
                    onCancel={() => setExpandedKey(null)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
