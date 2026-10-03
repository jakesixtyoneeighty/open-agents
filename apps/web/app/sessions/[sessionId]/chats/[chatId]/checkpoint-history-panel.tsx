"use client";

import { RefreshCw } from "lucide-react";
import { useCheckpointRestore } from "@/components/checkpoints/checkpoint-restore-context";
import { useCheckpointHistory } from "@/components/checkpoints/use-checkpoint-history";
import type { CheckpointListResponse } from "@/lib/checkpoints/types";
import { cn } from "@/lib/utils";
import { CheckpointHistoryEntry } from "./checkpoint-history-entry";

const formatMiB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

function PanelNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-3">
      <div className="flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed border-muted-foreground/25 px-4 py-8 text-center">
        <p className="text-xs text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

function RetentionFooter({
  retention,
}: {
  retention: CheckpointListResponse["retention"];
}) {
  return (
    <div className="shrink-0 space-y-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
      <p>
        {retention.entries} of {retention.maxEntries} change sets kept ·{" "}
        {formatMiB(retention.bytes)} of {formatMiB(retention.maxBytes)}
        {retention.pruned > 0 ? ` · ${retention.pruned} older removed` : ""}
      </p>
      <p>
        History is stored in this sandbox and is lost if the sandbox is replaced
        or deleted. Shell command changes are not recorded.
      </p>
    </div>
  );
}

/** Session-wide change history with user-driven restore controls. */
export function CheckpointHistoryPanel() {
  const restore = useCheckpointRestore();
  const { history, error, isRefreshing, refresh } = useCheckpointHistory(
    restore?.sessionId ?? "",
    Boolean(restore?.historyAvailable),
  );

  if (!restore) return null;
  if (!restore.historyAvailable)
    return (
      <PanelNotice>
        Change history lives in the sandbox. Resume the sandbox to view and
        restore earlier changes.
      </PanelNotice>
    );
  if (!history)
    return (
      <PanelNotice>
        {error ? error.message : "Loading change history…"}
      </PanelNotice>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-2 pb-1">
        <p className="text-[11px] text-muted-foreground">
          File-tool edits from every chat in this session, newest first.
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label="Refresh change history"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
          />
        </button>
      </div>
      {history.recoveryRequired.length > 0 ? (
        <p className="mx-3 mb-1 rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-300">
          An interrupted change needs recovery. The next edit or restore rolls
          it back, keeping any files that changed since.
        </p>
      ) : null}
      {history.entries.length === 0 ? (
        <PanelNotice>
          No recorded changes yet. Edits made with the agent&apos;s file tools
          appear here.
        </PanelNotice>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {history.entries.map((entry) => (
            <CheckpointHistoryEntry
              key={entry.changeSetId}
              sessionId={restore.sessionId}
              entry={entry}
              onRestore={(scope) =>
                restore.openRestore({ changeSetId: entry.changeSetId, scope })
              }
            />
          ))}
        </ul>
      )}
      <RetentionFooter retention={history.retention} />
    </div>
  );
}
