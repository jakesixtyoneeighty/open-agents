export interface TextReplacement {
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

export interface PatchHunk {
  before: string[];
  after: string[];
  atEnd?: boolean;
}

export type WorkspaceEditOperation =
  | { kind: "create"; path: string; content: string }
  | { kind: "write"; path: string; content: string; expectedRevision?: string }
  | {
      kind: "update";
      path: string;
      expectedRevision?: string;
      edits?: TextReplacement[];
      hunks?: PatchHunk[];
      moveTo?: string;
    }
  | { kind: "delete"; path: string; expectedRevision: string };

/** Host-derived attribution recorded in the journal; never model input. */
export interface WorkspaceEditOrigin {
  source: "agent" | "user";
  toolName: string;
  /** Host chat/task scope, for example `${sessionId}:${chatId}:build`. */
  scope?: string;
}

/**
 * User-driven reversal. `change` reverses one change set; `checkpoint`
 * reverses it and every later committed change set, newest first.
 */
export interface WorkspaceRevertTarget {
  changeSetId: string;
  scope: "change" | "checkpoint";
  /**
   * Current revisions returned by the preview (`null` = file absent). Required
   * to apply: any difference fails the restore before writing.
   */
  expectedRevisions?: Record<string, string | null>;
}

export type WorkspaceEditRequest = {
  id: string;
  dryRun?: boolean;
  /** Semantic edits must still describe this entire working tree under the lock. */
  expectedWorkspaceRevision?: string;
  /** Additional semantic inputs, including ignored source/config files. */
  readRevisions?: Record<string, string>;
  /** Only legacy single-file tools and user restores may set this. */
  allowSensitive?: boolean;
  origin?: WorkspaceEditOrigin;
} & (
  | { operations: WorkspaceEditOperation[]; undo?: never; revert?: never }
  | { undo: string; operations?: never; revert?: never }
  | { revert: WorkspaceRevertTarget; operations?: never; undo?: never }
);

export interface WorkspaceFileChange {
  path: string;
  before: string | null;
  after: string | null;
  beforeRevision: string | null;
  afterRevision: string | null;
  /** Sensitive legacy edits never return file contents. */
  redacted?: boolean;
  /**
   * Revert previews only. `exact`: current matched the recorded state;
   * `merged`: inverse hunks applied around other edits; `unchanged`: already
   * reverted; `conflict`: left untouched (see `reason`).
   */
  revertStatus?: "exact" | "merged" | "unchanged" | "conflict";
  reason?: string;
}

export type WorkspaceEditResult =
  | {
      success: true;
      changeSetId: string;
      dryRun: boolean;
      replayed?: boolean;
      changes: WorkspaceFileChange[];
      replacements: number;
      startLine?: number;
      /** Revert requests only: change sets reversed, newest first. */
      reverts?: string[];
    }
  | {
      success: false;
      error: string;
      changeSetId?: string;
      rollbackFailedPaths?: string[];
    };

export type WorkspaceHistoryRequest =
  | { history: "list" }
  | { history: "show"; changeSetId: string };

export interface WorkspaceHistoryFile {
  path: string;
  kind: "created" | "updated" | "deleted";
  additions: number;
  deletions: number;
}

export interface WorkspaceHistoryEntry {
  changeSetId: string;
  /** Commit time in ms since epoch (journal mtime for phase 1 journals). */
  committedAt: number;
  origin: WorkspaceEditOrigin | null;
  /** `reverted` when a later active change set reverses this one. */
  status: "active" | "reverted";
  revertedBy?: string;
  /** Change sets this entry reverses (undo, revert and restore entries). */
  reverts?: string[];
  files: WorkspaceHistoryFile[];
}

export interface WorkspaceHistoryRetention {
  maxEntries: number;
  maxBytes: number;
  entries: number;
  bytes: number;
  /** Completed change sets removed by retention so far in this sandbox. */
  pruned: number;
}

export type WorkspaceHistoryResult =
  | {
      success: true;
      history: "list";
      entries: WorkspaceHistoryEntry[];
      retention: WorkspaceHistoryRetention;
      /** Interrupted change sets the next edit will try to roll back. */
      recoveryRequired: string[];
    }
  | {
      success: true;
      history: "show";
      entry: WorkspaceHistoryEntry;
      changes: WorkspaceFileChange[];
    }
  | { success: false; error: string };
