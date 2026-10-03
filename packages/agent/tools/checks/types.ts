export type CheckKind =
  | "typecheck"
  | "lint"
  | "format"
  | "test"
  | "build"
  | "ci"
  | "script";

export interface CheckDefinition {
  /** Script name for package.json checks; a stable slug otherwise (e.g. go-test). */
  id: string;
  kind: CheckKind;
  command: string;
  /** Workspace-relative directory the command runs in ("" is the root). */
  cwd: string;
  source: "package.json" | "go.mod" | "Cargo.toml" | "python";
  /** Part of the default run: at most one check per typecheck/lint/format/test kind. */
  default: boolean;
}

export interface CheckDiagnostic {
  file?: string;
  line?: number;
  column?: number;
  severity: "error" | "warning";
  code?: string;
  message: string;
  source:
    | "typescript"
    | "eslint"
    | "oxlint"
    | "biome"
    | "rust"
    | "compiler"
    | "test";
}

export type CheckStatus = "passed" | "failed" | "timed_out" | "error";

/** One stored run. Diagnostics are kept as fingerprints for baseline comparison. */
export interface CheckRecord {
  runId: string;
  checkId: string;
  command: string;
  cwd: string;
  status: CheckStatus;
  exitCode: number | null;
  /** Git tree of the whole working tree when the check started; null outside git. */
  revision: string | null;
  /** Revision after the check; differs when files changed while it ran. */
  revisionAfter: string | null;
  /** True when the working tree differed from HEAD. */
  dirty: boolean;
  recordedAt: string;
  durationMs: number;
  commandId?: string;
  fingerprints: string[];
  diagnosticCount: number;
}

export interface CheckHistory {
  version: 1;
  /** Most recent run on a clean working tree. */
  baseline?: CheckRecord;
  /** Earliest run recorded in this sandbox; the fallback baseline. */
  first?: CheckRecord;
  /** Newest last; bounded. */
  runs: CheckRecord[];
}

export interface WorkspaceRevision {
  revision: string | null;
  headTree: string | null;
  headCommit: string | null;
  dirty: boolean;
  /** Why no revision is available (for example, not a git repository). */
  unavailableReason?: string;
}
