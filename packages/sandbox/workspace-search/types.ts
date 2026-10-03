export type WorkspaceSearchQuery =
  | {
      kind: "content";
      /** Workspace-relative file or directory; "" or "." is the root. */
      path: string;
      pattern: string;
      mode: "regex" | "literal";
      caseSensitive: boolean;
      /** No "/" matches basenames; otherwise paths relative to `path`. */
      glob?: string;
      output: "content" | "files" | "count";
      before: number;
      after: number;
      includeHidden: boolean;
      includeIgnored: boolean;
    }
  | {
      kind: "files";
      path: string;
      /** Matched against paths relative to `path`. */
      pattern: string;
      sort: "modified" | "path";
      includeHidden: boolean;
      includeIgnored: boolean;
    };

export type WorkspaceSearchRequest = {
  /** 32–64 lowercase hex characters; names the stored result set. */
  id: string;
  limit: number;
  /** Scan budget for this call; capped by the worker. */
  budgetMs?: number;
} & (
  | { action: "search"; query: WorkspaceSearchQuery }
  | { action: "page"; offset: number }
);

export interface WorkspaceSearchContextLine {
  line: number;
  content: string;
  truncated?: true;
}

export type WorkspaceSearchEntry =
  | {
      file: string;
      line: number;
      /** 1-based UTF-16 column of the first match on the line. */
      column: number;
      content: string;
      /** Set when `content` is a window of a long line; pass to read's columnOffset. */
      contentOffset?: number;
      truncated?: true;
      before?: WorkspaceSearchContextLine[];
      after?: WorkspaceSearchContextLine[];
    }
  | { file: string; count: number }
  | { file: string }
  | { path: string; size: number; modifiedAt: string };

export type WorkspaceSearchSkipReason =
  | "sensitive"
  | "binary"
  | "tooLarge"
  | "symlink"
  | "unreadable"
  | "timeout";

export interface WorkspaceSearchSkipped {
  count: number;
  /** Up to 20 example paths. */
  paths: string[];
}

export type WorkspaceSearchResult =
  | {
      success: true;
      searchId: string;
      query: WorkspaceSearchQuery;
      offset: number;
      entries: WorkspaceSearchEntry[];
      /** Present while more entries are stored or the scan can resume. */
      nextOffset?: number;
      storedEntries: number;
      totalMatches: number;
      totalFiles: number;
      scannedFiles: number;
      candidateFiles: number;
      /** False when git was unavailable and ignored files were not filtered. */
      respectsGitignore: boolean;
      complete: boolean;
      incompleteReason?: "time_limit" | "result_limit";
      skipped: Partial<
        Record<WorkspaceSearchSkipReason, WorkspaceSearchSkipped>
      >;
    }
  | { success: false; error: string };
