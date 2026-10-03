import { randomUUID } from "node:crypto";
import * as path from "path";
import type { Sandbox } from "@open-agents/sandbox";
import {
  compareWithBaseline,
  diagnosticFingerprint,
  parseDiagnostics,
} from "./diagnostics";
import { loadCheckHistory, saveCheckRecord, selectBaseline } from "./history";
import {
  findFilesByBasename,
  getChangedFiles,
  getWorkspaceRevision,
} from "./revision";
import type {
  CheckDefinition,
  CheckDiagnostic,
  CheckRecord,
  CheckStatus,
  WorkspaceRevision,
} from "./types";

const OUTPUT_PREVIEW = 4000;
const PARSE_LIMIT = 2_000_000;
const REPORTED_DIAGNOSTICS = 40;

export type ReportedDiagnostic = CheckDiagnostic & {
  origin?: "new" | "existing";
  /** The file differs from HEAD in the working tree. */
  changedFile?: boolean;
};

export type CheckVerdict =
  | "passed"
  | "fixed"
  | "new_failure"
  | "existing_failure"
  | "new_and_existing_failures"
  | "failed_unclassified"
  /** Timed out or could not run; says nothing about the code. */
  | "not_completed";

export interface CheckRunResult {
  id: string;
  kind: CheckDefinition["kind"];
  command: string;
  cwd: string;
  status: CheckStatus;
  exitCode: number | null;
  durationMs: number;
  revision: string | null;
  /** Files changed while the check ran, so this result describes no single revision. */
  revisionChanged?: true;
  verdict: CheckVerdict;
  diagnosticCount: number;
  diagnostics: ReportedDiagnostic[];
  baseline: {
    status: CheckStatus;
    revision: string | null;
    recordedAt: string;
    /** False when the baseline already included uncommitted changes. */
    clean: boolean;
    newCount: number;
    existingCount: number;
    fixedCount: number;
  } | null;
  /** Retrieve the complete logs with command_output. */
  commandId?: string;
  /** Kept when the check failed without recognizable diagnostics. */
  output?: { stdout: string; stderr: string };
}

function toWorkspaceFile(file: string, checkCwd: string, root: string) {
  if (path.posix.isAbsolute(file)) {
    const relative = path.posix.relative(root, file);
    return relative.startsWith("..") ? file : relative;
  }
  return path.posix.normalize(path.posix.join(checkCwd || ".", file));
}

/**
 * Maps reported paths to workspace files. Tools print paths relative to the
 * directory they ran in, which task runners (turbo, nx) do not reveal, so a
 * unique tracked file with the same suffix is accepted.
 */
async function resolveDiagnosticFiles(
  sandbox: Sandbox,
  diagnostics: CheckDiagnostic[],
  checkCwd: string,
  signal?: AbortSignal,
) {
  const root = sandbox.workingDirectory;
  const withFiles = diagnostics.filter((diagnostic) => diagnostic.file);
  if (withFiles.length === 0) return diagnostics;
  const basenames = [
    ...new Set(
      withFiles.map((diagnostic) => path.posix.basename(diagnostic.file ?? "")),
    ),
  ];
  const known = await findFilesByBasename(sandbox, basenames, signal).catch(
    () => null,
  );
  const files = known ? new Set(known) : null;
  return diagnostics.map((diagnostic) => {
    if (!diagnostic.file) return diagnostic;
    const candidate = toWorkspaceFile(diagnostic.file, checkCwd, root);
    if (!files || files.has(candidate))
      return { ...diagnostic, file: candidate };
    const reported = path.posix.normalize(diagnostic.file);
    if (files.has(reported)) return { ...diagnostic, file: reported };
    const suffix = known?.filter((file) => file.endsWith(`/${reported}`)) ?? [];
    return { ...diagnostic, file: suffix.length === 1 ? suffix[0] : candidate };
  });
}

function verdictFor(
  status: CheckStatus,
  baselineStatus: CheckStatus | undefined,
  counts: { newCount: number; existingCount: number } | null,
): CheckVerdict {
  if (status === "passed")
    return baselineStatus === "failed" ? "fixed" : "passed";
  if (status !== "failed") return "not_completed";
  if (!baselineStatus) return "failed_unclassified";
  if (baselineStatus === "passed") return "new_failure";
  if (!counts || counts.newCount + counts.existingCount === 0)
    return "failed_unclassified";
  if (counts.newCount === 0) return "existing_failure";
  return counts.existingCount === 0
    ? "new_failure"
    : "new_and_existing_failures";
}

async function runOne(
  sandbox: Sandbox,
  check: CheckDefinition,
  before: WorkspaceRevision,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  changedFiles: () => Promise<Set<string> | null>,
) {
  const startedAt = Date.now();
  const result = await sandbox.exec(
    check.command,
    path.posix.join(sandbox.workingDirectory, check.cwd),
    timeoutMs,
    { signal, outputLimit: OUTPUT_PREVIEW, fullOutputLimit: PARSE_LIMIT },
  );
  const durationMs = Date.now() - startedAt;
  const after = await getWorkspaceRevision(sandbox, signal);
  const status: CheckStatus = result.timedOut
    ? "timed_out"
    : result.exitCode === 0
      ? "passed"
      : result.exitCode === null
        ? "error"
        : "failed";
  const full = result.fullOutput ?? {
    stdout: result.stdout,
    stderr: result.stderr,
  };
  const diagnostics = await resolveDiagnosticFiles(
    sandbox,
    parseDiagnostics(`${full.stdout}\n${full.stderr}`),
    check.cwd,
    signal,
  );
  const history = await loadCheckHistory(sandbox, check.cwd, check.command);
  const baseline = selectBaseline(history);
  const comparison = baseline
    ? compareWithBaseline(diagnostics, baseline.record.fingerprints)
    : null;
  const changed = diagnostics.some((diagnostic) => diagnostic.file)
    ? await changedFiles()
    : null;
  const reported: ReportedDiagnostic[] = diagnostics.map(
    (diagnostic, index) => ({
      ...diagnostic,
      ...(comparison ? { origin: comparison.origins[index] } : {}),
      ...(changed && diagnostic.file
        ? { changedFile: changed.has(diagnostic.file) }
        : {}),
    }),
  );
  // New problems first, then errors, so bounded output keeps the most useful ones.
  reported.sort(
    (a, b) =>
      Number(a.origin === "existing") - Number(b.origin === "existing") ||
      Number(a.severity === "warning") - Number(b.severity === "warning"),
  );
  const newCount =
    comparison?.origins.filter((origin) => origin === "new").length ?? 0;
  const counts = comparison
    ? { newCount, existingCount: diagnostics.length - newCount }
    : null;
  const record: CheckRecord = {
    runId: randomUUID(),
    checkId: check.id,
    command: check.command,
    cwd: check.cwd,
    status,
    exitCode: result.exitCode,
    revision: before.revision,
    revisionAfter: after.revision,
    dirty: before.dirty,
    recordedAt: new Date(startedAt).toISOString(),
    durationMs,
    ...(result.commandId ? { commandId: result.commandId } : {}),
    fingerprints: diagnostics.map(diagnosticFingerprint),
    diagnosticCount: diagnostics.length,
  };
  const saved = await saveCheckRecord(sandbox, history, record);
  const output: CheckRunResult = {
    id: check.id,
    kind: check.kind,
    command: check.command,
    cwd: check.cwd || ".",
    status,
    exitCode: result.exitCode,
    durationMs,
    revision: before.revision,
    ...(before.revision !== after.revision
      ? { revisionChanged: true as const }
      : {}),
    verdict: verdictFor(status, baseline?.record.status, counts),
    diagnosticCount: diagnostics.length,
    diagnostics: reported.slice(0, REPORTED_DIAGNOSTICS),
    baseline:
      baseline && counts && comparison
        ? {
            status: baseline.record.status,
            revision: baseline.record.revision,
            recordedAt: baseline.record.recordedAt,
            clean: baseline.clean,
            ...counts,
            fixedCount: comparison.fixed,
          }
        : null,
    ...(result.commandId ? { commandId: result.commandId } : {}),
    ...(status !== "passed" && diagnostics.length === 0
      ? { output: { stdout: result.stdout, stderr: result.stderr } }
      : {}),
  };
  return { output, after, saved };
}

export async function runChecks(params: {
  sandbox: Sandbox;
  checks: CheckDefinition[];
  timeoutMs: number;
  signal?: AbortSignal;
}) {
  const { sandbox, signal } = params;
  const start = await getWorkspaceRevision(sandbox, signal);
  let changed: Promise<Set<string> | null> | undefined;
  const changedFiles = () => {
    changed ??= getChangedFiles(sandbox, signal).catch(() => null);
    return changed;
  };
  let before = start;
  let historySaved = true;
  const results: CheckRunResult[] = [];
  // Sequential: builds and tests commonly share output directories.
  for (const check of params.checks) {
    const { output, after, saved } = await runOne(
      sandbox,
      check,
      before,
      params.timeoutMs,
      signal,
      changedFiles,
    );
    if (after.revision !== before.revision) changed = undefined;
    results.push(output);
    historySaved &&= saved;
    before = after;
  }
  const stable = results.every((result) => !result.revisionChanged);
  const passed = results.every((result) => result.status === "passed");
  const notes: string[] = [];
  if (start.unavailableReason) {
    notes.push(
      `${start.unavailableReason} Results are not bound to a revision and cannot be compared later.`,
    );
  } else if (!stable) {
    notes.push(
      "Files changed while checks ran (for example, a script that formats or generates files). Rerun before relying on these results.",
    );
  }
  if (!historySaved) {
    notes.push(
      "Check history is unavailable, so later runs cannot compare against this one.",
    );
  }
  if (results.some((result) => result.verdict === "failed_unclassified")) {
    notes.push(
      "Some failures could not be classified as new or existing: no earlier run was recorded or no diagnostics were recognized. Run checks before editing to record a baseline.",
    );
  }
  return {
    success: true as const,
    passed: passed && stable && start.revision !== null,
    revision: start.revision,
    headCommit: start.headCommit,
    dirty: start.dirty,
    checks: results,
    ...(notes.length ? { note: notes.join(" ") } : {}),
  };
}

/** Latest stored result per check, marked current only for the present revision. */
export async function listChecks(params: {
  sandbox: Sandbox;
  checks: CheckDefinition[];
  signal?: AbortSignal;
}) {
  const current = await getWorkspaceRevision(params.sandbox, params.signal);
  const checks = await Promise.all(
    params.checks.map(async (check) => {
      const history = await loadCheckHistory(
        params.sandbox,
        check.cwd,
        check.command,
      );
      const latest = history?.runs.at(-1);
      return {
        id: check.id,
        kind: check.kind,
        command: check.command,
        cwd: check.cwd || ".",
        default: check.default,
        ...(latest
          ? {
              latest: {
                status: latest.status,
                recordedAt: latest.recordedAt,
                revision: latest.revision,
                diagnosticCount: latest.diagnosticCount,
                current:
                  current.revision !== null &&
                  latest.revision === current.revision &&
                  latest.revisionAfter === current.revision,
              },
            }
          : {}),
      };
    }),
  );
  return {
    success: true as const,
    revision: current.revision,
    headCommit: current.headCommit,
    dirty: current.dirty,
    checks,
    ...(current.unavailableReason ? { note: current.unavailableReason } : {}),
  };
}
