import type {
  WorkspaceFileChange,
  WorkspaceHistoryEntry,
  WorkspaceHistoryRetention,
} from "@open-agents/sandbox";

/** A journaled change set, attributed to the chat that produced it. */
export type CheckpointEntry = Omit<WorkspaceHistoryEntry, "origin"> & {
  source: "agent" | "user" | null;
  toolName: string | null;
  chat: { id: string; title: string } | null;
  /** Made by a delegated subagent task inside that chat. */
  viaTask: boolean;
};

export type CheckpointListResponse = {
  entries: CheckpointEntry[];
  retention: WorkspaceHistoryRetention;
  recoveryRequired: string[];
};

export type CheckpointShowResponse = {
  entry: CheckpointEntry;
  changes: WorkspaceFileChange[];
};

export type CheckpointRestoreScope = "change" | "checkpoint";

export type CheckpointRestoreRequest = {
  changeSetId: string;
  scope: CheckpointRestoreScope;
  /** Client-generated UUID; a retry with the same ID replays the result. */
  requestId: string;
  dryRun?: boolean;
  /** Current revisions from the preview; required to apply. */
  expectedRevisions?: Record<string, string | null>;
};

export type CheckpointRestoreResponse = {
  changeSetId: string;
  dryRun: boolean;
  replayed: boolean;
  /** Change sets reversed, newest first. */
  reverts: string[];
  changes: WorkspaceFileChange[];
};

export type CheckpointErrorResponse = {
  error: string;
  rollbackFailedPaths?: string[];
};
