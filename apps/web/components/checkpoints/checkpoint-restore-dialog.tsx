"use client";

import { MultiFileDiff } from "@pierre/diffs/react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { WorkspaceFileChange } from "@open-agents/sandbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { defaultDiffOptions } from "@/lib/diffs-config";
import { cn } from "@/lib/utils";
import type { CheckpointRestoreTarget } from "./checkpoint-restore-context";
import {
  summarizeRestorePreview,
  useRestorePreview,
} from "./use-restore-preview";

const STATUS_LABELS: Record<
  NonNullable<WorkspaceFileChange["revertStatus"]>,
  string
> = {
  exact: "Restores recorded content",
  merged: "Merged around later edits",
  unchanged: "Already matches; not changed",
  conflict: "Conflict; not changed",
};

function RestoreFilePreview({ change }: { change: WorkspaceFileChange }) {
  const status = change.revertStatus ?? "exact";
  const changing = status === "exact" || status === "merged";
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono break-all">{change.path}</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5",
            status === "conflict"
              ? "bg-destructive/10 text-destructive"
              : status === "merged"
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "bg-muted text-muted-foreground",
          )}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>
      {change.reason ? (
        <p className="text-xs text-destructive">{change.reason}</p>
      ) : null}
      {changing && change.redacted ? (
        <p className="text-xs text-muted-foreground">
          Contents hidden for this file.
        </p>
      ) : changing ? (
        <div className="overflow-hidden rounded-md border border-border">
          <MultiFileDiff
            oldFile={{ name: change.path, contents: change.before ?? "" }}
            newFile={{ name: change.path, contents: change.after ?? "" }}
            options={defaultDiffOptions}
          />
        </div>
      ) : null}
    </section>
  );
}

export function CheckpointRestoreDialog({
  sessionId,
  target,
  onClose,
  onRestored,
}: {
  sessionId: string;
  target: CheckpointRestoreTarget | null;
  onClose: () => void;
  onRestored: () => Promise<void>;
}) {
  const { state, applying, applyError, apply, reload } = useRestorePreview(
    sessionId,
    target,
  );
  const preview = state.status === "ready" ? state.preview : null;
  const summary = preview ? summarizeRestorePreview(preview) : null;
  const isCheckpoint = target?.scope === "checkpoint";
  const laterCount = Math.max(0, (preview?.reverts.length ?? 1) - 1);

  const handleApply = async () => {
    const result = await apply();
    if (!result) return;
    const files = result.changes.filter(
      (change) =>
        change.revertStatus === "exact" || change.revertStatus === "merged",
    ).length;
    toast.success(
      `${isCheckpoint ? "Restored" : "Reverted"} ${files} ${files === 1 ? "file" : "files"}`,
      {
        description:
          "Recorded in History. Revert that entry to undo this restore.",
      },
    );
    onClose();
    await onRestored();
  };

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !applying) onClose();
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isCheckpoint ? "Restore to before this change" : "Revert change"}
          </DialogTitle>
          <DialogDescription>
            {isCheckpoint
              ? laterCount > 0
                ? `Reverses this change set and ${laterCount} later ${laterCount === 1 ? "one" : "ones"}, newest first.`
                : "Reverses this change set. No later change sets were recorded."
              : "Reverses only this change set."}{" "}
            Files not listed are left alone. Review the exact result before
            restoring.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {state.status === "loading" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing preview…
            </p>
          ) : state.status === "error" ? (
            <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
              {state.message}
            </p>
          ) : preview && summary ? (
            <>
              {summary.conflicts > 0 ? (
                <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                  {summary.conflicts}{" "}
                  {summary.conflicts === 1 ? "file has" : "files have"} later
                  edits that overlap this change, so nothing can be restored
                  yet. Resolve or revert those edits, then preview again.
                </p>
              ) : summary.changing === 0 ? (
                <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                  These changes are already reverted. Nothing to restore.
                </p>
              ) : summary.merged > 0 ? (
                <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                  Some files were edited after this change. Only the recorded
                  lines are reversed; the later edits are kept.
                </p>
              ) : null}
              {preview.changes.map((change) => (
                <RestoreFilePreview key={change.path} change={change} />
              ))}
              <p className="text-xs text-muted-foreground">
                Shell command changes are not recorded in history. They are kept
                where they don&apos;t overlap, and reported as conflicts where
                they do.
              </p>
            </>
          ) : null}
        </div>

        {applyError ? (
          <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {applyError}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          {applyError || state.status === "error" ? (
            <Button
              variant="outline"
              onClick={() => void reload()}
              disabled={applying}
            >
              Preview again
            </Button>
          ) : null}
          <Button
            onClick={() => void handleApply()}
            disabled={!summary?.canApply || applying}
          >
            {applying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" />
            )}
            {isCheckpoint ? "Restore" : "Revert"}
            {summary?.canApply
              ? ` ${summary.changing} ${summary.changing === 1 ? "file" : "files"}`
              : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
