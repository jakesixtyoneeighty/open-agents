"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckpointRequestError,
  requestCheckpointRestore,
} from "@/lib/checkpoints/api";
import type { CheckpointRestoreResponse } from "@/lib/checkpoints/types";
import type { CheckpointRestoreTarget } from "./checkpoint-restore-context";

export type RestorePreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; preview: CheckpointRestoreResponse }
  | { status: "error"; message: string };

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/** The apply request must carry exactly the revisions the user previewed. */
export function expectedRevisionsFrom(preview: CheckpointRestoreResponse) {
  return Object.fromEntries(
    preview.changes.map((change) => [change.path, change.beforeRevision]),
  );
}

export function summarizeRestorePreview(preview: CheckpointRestoreResponse) {
  const count = (status: string) =>
    preview.changes.filter((change) => change.revertStatus === status).length;
  const conflicts = count("conflict");
  const changing = count("exact") + count("merged");
  return {
    changing,
    merged: count("merged"),
    unchanged: count("unchanged"),
    conflicts,
    canApply: conflicts === 0 && changing > 0,
  };
}

export function useRestorePreview(
  sessionId: string,
  target: CheckpointRestoreTarget | null,
) {
  const [state, setState] = useState<RestorePreviewState>({ status: "idle" });
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  // Stable across apply retries so a lost response replays, not re-applies.
  const applyRequestId = useRef<string>("");
  const generation = useRef(0);

  const loadPreview = useCallback(async () => {
    if (!target) return;
    const current = ++generation.current;
    setState({ status: "loading" });
    setApplyError(null);
    try {
      const preview = await requestCheckpointRestore(sessionId, {
        ...target,
        requestId: crypto.randomUUID(),
        dryRun: true,
      });
      if (current === generation.current)
        setState({ status: "ready", preview });
    } catch (error) {
      if (current === generation.current)
        setState({
          status: "error",
          message: errorMessage(error, "Could not preview this restore."),
        });
    }
  }, [sessionId, target]);

  useEffect(() => {
    if (!target) {
      generation.current++;
      setState({ status: "idle" });
      setApplyError(null);
      return;
    }
    applyRequestId.current = crypto.randomUUID();
    void loadPreview();
  }, [loadPreview, target]);

  const apply = useCallback(async () => {
    if (!target || state.status !== "ready") return null;
    setApplying(true);
    setApplyError(null);
    try {
      return await requestCheckpointRestore(sessionId, {
        ...target,
        requestId: applyRequestId.current,
        expectedRevisions: expectedRevisionsFrom(state.preview),
      });
    } catch (error) {
      setApplyError(errorMessage(error, "Restore failed."));
      // The server answered, so this ID is spent; network failures keep it
      // so a retry replays a restore that may already have been applied.
      if (error instanceof CheckpointRequestError)
        applyRequestId.current = crypto.randomUUID();
      return null;
    } finally {
      setApplying(false);
    }
  }, [sessionId, state, target]);

  return { state, applying, applyError, apply, reload: loadPreview };
}
