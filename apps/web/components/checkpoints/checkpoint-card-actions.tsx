"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useCheckpointRestore } from "./checkpoint-restore-context";
import { useCheckpointHistory } from "./use-checkpoint-history";

type RestoreContext = NonNullable<ReturnType<typeof useCheckpointRestore>>;

function CardHistoryStatus({
  restore,
  changeSetId,
}: {
  restore: RestoreContext;
  changeSetId: string;
}) {
  const { history, error, refresh } = useCheckpointHistory(
    restore.sessionId,
    restore.historyAvailable,
  );
  const entry = history?.entries.find(
    (item) => item.changeSetId === changeSetId,
  );
  // The cached list can predate this edit; recheck once before saying the
  // change is gone.
  const [rechecked, setRechecked] = useState(false);
  const missing = Boolean(history) && !entry;
  useEffect(() => {
    if (!missing || rechecked) return;
    void refresh().finally(() => setRechecked(true));
  }, [missing, rechecked, refresh]);

  if (!restore.historyAvailable)
    return <p>Change history is unavailable while the sandbox is paused.</p>;
  if (!history || (!entry && !rechecked))
    return <p>{error ? error.message : "Checking change history…"}</p>;
  if (!entry)
    return (
      <p>
        This change is no longer in this sandbox&apos;s history. It was pruned
        or recorded in a sandbox that has since been replaced, so it can&apos;t
        be restored here.
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span>
        {entry.status === "reverted" ? "Reverted" : "Available in History"}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-xs"
        disabled={entry.status === "reverted"}
        title={
          entry.status === "reverted"
            ? "This change is already reverted"
            : undefined
        }
        onClick={() => restore.openRestore({ changeSetId, scope: "change" })}
      >
        Revert…
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-xs"
        onClick={() =>
          restore.openRestore({ changeSetId, scope: "checkpoint" })
        }
      >
        Restore to before…
      </Button>
    </div>
  );
}

/**
 * Restore controls for an edit card. Without a session restore provider (for
 * example shared transcripts) the fallback renders instead.
 */
export function CheckpointCardActions({
  changeSetId,
  fallback = null,
}: {
  changeSetId: string;
  fallback?: ReactNode;
}) {
  const restore = useCheckpointRestore();
  if (!restore) return <>{fallback}</>;
  return (
    <div className="text-xs text-muted-foreground">
      <CardHistoryStatus restore={restore} changeSetId={changeSetId} />
    </div>
  );
}
