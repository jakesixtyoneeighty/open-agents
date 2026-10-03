"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSWRConfig } from "swr";
import { checkpointHistoryKey } from "@/lib/checkpoints/api";
import type { CheckpointRestoreScope } from "@/lib/checkpoints/types";
import { CheckpointRestoreDialog } from "./checkpoint-restore-dialog";

export type CheckpointRestoreTarget = {
  changeSetId: string;
  scope: CheckpointRestoreScope;
};

type CheckpointRestoreContextValue = {
  sessionId: string;
  /** False while the sandbox is not running; history is unavailable. */
  historyAvailable: boolean;
  openRestore: (target: CheckpointRestoreTarget) => void;
};

const CheckpointRestoreContext =
  createContext<CheckpointRestoreContextValue | null>(null);

/**
 * Session-scoped restore controls. Shared transcripts render without this
 * provider, so edit cards there never offer restore.
 */
export function CheckpointRestoreProvider({
  sessionId,
  historyAvailable,
  onRestored,
  children,
}: {
  sessionId: string;
  historyAvailable: boolean;
  onRestored: () => Promise<unknown>;
  children: ReactNode;
}) {
  const [target, setTarget] = useState<CheckpointRestoreTarget | null>(null);
  const { mutate } = useSWRConfig();

  const handleRestored = useCallback(async () => {
    await Promise.allSettled([
      mutate(checkpointHistoryKey(sessionId)),
      onRestored(),
    ]);
  }, [mutate, onRestored, sessionId]);

  const value = useMemo(
    () => ({ sessionId, historyAvailable, openRestore: setTarget }),
    [historyAvailable, sessionId],
  );

  return (
    <CheckpointRestoreContext.Provider value={value}>
      {children}
      <CheckpointRestoreDialog
        sessionId={sessionId}
        target={target}
        onClose={() => setTarget(null)}
        onRestored={handleRestored}
      />
    </CheckpointRestoreContext.Provider>
  );
}

export function useCheckpointRestore() {
  return useContext(CheckpointRestoreContext);
}
