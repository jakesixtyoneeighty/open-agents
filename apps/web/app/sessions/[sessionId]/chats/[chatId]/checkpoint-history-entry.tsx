"use client";

import { MultiFileDiff } from "@pierre/diffs/react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  checkpointToolLabel,
  fetchCheckpointChanges,
} from "@/lib/checkpoints/api";
import type { CheckpointEntry } from "@/lib/checkpoints/types";
import { defaultDiffOptions } from "@/lib/diffs-config";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { cn } from "@/lib/utils";

const MAX_LISTED_FILES = 4;

function EntryChanges({
  sessionId,
  changeSetId,
}: {
  sessionId: string;
  changeSetId: string;
}) {
  const { data, error, isLoading } = useSWR(
    ["checkpoint-changes", sessionId, changeSetId],
    () => fetchCheckpointChanges(sessionId, changeSetId),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  if (isLoading)
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading changes…
      </p>
    );
  if (error || !data)
    return (
      <p className="text-xs text-destructive">
        {error instanceof Error ? error.message : "Changes are unavailable."}
      </p>
    );
  return (
    <div className="space-y-2">
      {data.changes.map((change) =>
        change.redacted ? (
          <p key={change.path} className="text-xs text-muted-foreground">
            {change.path}: contents hidden.
          </p>
        ) : (
          <div
            key={change.path}
            className="overflow-hidden rounded-md border border-border"
          >
            <MultiFileDiff
              oldFile={{ name: change.path, contents: change.before ?? "" }}
              newFile={{ name: change.path, contents: change.after ?? "" }}
              options={defaultDiffOptions}
            />
          </div>
        ),
      )}
    </div>
  );
}

export function CheckpointHistoryEntry({
  sessionId,
  entry,
  onRestore,
}: {
  sessionId: string;
  entry: CheckpointEntry;
  onRestore: (scope: "change" | "checkpoint") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const reverted = entry.status === "reverted";
  const additions = entry.files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = entry.files.reduce((sum, file) => sum + file.deletions, 0);
  const committedAt = new Date(entry.committedAt);

  return (
    <li className="space-y-2 border-b border-border px-3 py-2.5 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start gap-1.5 text-left"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span
              className={cn(
                "font-medium",
                reverted && "text-muted-foreground line-through",
              )}
            >
              {checkpointToolLabel(entry.toolName)}
            </span>
            {entry.source === "user" ? (
              <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                You
              </span>
            ) : null}
            {reverted ? (
              <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                Reverted
              </span>
            ) : null}
            <span className="font-mono text-[10px]">
              <span className="text-green-500">+{additions}</span>{" "}
              <span className="text-red-500">-{deletions}</span>
            </span>
            <time
              className="ml-auto text-[10px] text-muted-foreground"
              dateTime={committedAt.toISOString()}
              title={committedAt.toLocaleString()}
            >
              {formatRelativeTime(committedAt)}
            </time>
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {entry.files
              .slice(0, MAX_LISTED_FILES)
              .map((file) => file.path)
              .join(", ")}
            {entry.files.length > MAX_LISTED_FILES
              ? ` +${entry.files.length - MAX_LISTED_FILES} more`
              : ""}
          </span>
          {entry.chat ? (
            <span className="block truncate text-[11px] text-muted-foreground">
              {entry.chat.title}
              {entry.viaTask ? " · subagent" : ""}
            </span>
          ) : null}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-2 pl-5">
          <EntryChanges sessionId={sessionId} changeSetId={entry.changeSetId} />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={reverted}
              title={reverted ? "This change is already reverted" : undefined}
              onClick={() => onRestore("change")}
            >
              Revert this change…
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onRestore("checkpoint")}
            >
              Restore to before this…
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
