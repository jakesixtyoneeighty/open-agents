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

export type WorkspaceEditRequest = {
  id: string;
  dryRun?: boolean;
  /** Only legacy single-file tools may set this after their approval check. */
  allowSensitive?: boolean;
} & (
  | { operations: WorkspaceEditOperation[]; undo?: never }
  | { undo: string; operations?: never }
);

export interface WorkspaceFileChange {
  path: string;
  before: string | null;
  after: string | null;
  beforeRevision: string | null;
  afterRevision: string | null;
  /** Sensitive legacy edits never return file contents. */
  redacted?: boolean;
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
    }
  | {
      success: false;
      error: string;
      changeSetId?: string;
      rollbackFailedPaths?: string[];
    };
