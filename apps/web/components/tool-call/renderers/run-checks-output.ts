/** Display model for run_checks outputs, narrowed from unknown. */

export type CheckRow = {
  id: string;
  command: string;
  status: string;
  durationMs?: number;
  verdictLabel?: string;
  revisionChanged: boolean;
  diagnosticCount: number;
  diagnostics: string[];
  output?: string;
  commandId?: string;
};

export type RunChecksSummary =
  | {
      kind: "run";
      rows: CheckRow[];
      passed: number;
      failed: number;
      incomplete: number;
      revision?: string;
      allPassed: boolean;
      note?: string;
    }
  | {
      kind: "list";
      rows: { id: string; command: string; latest?: string }[];
      note?: string;
    };

const VERDICTS: Record<string, string> = {
  fixed: "fixed since baseline",
  new_failure: "new failure",
  existing_failure: "existing failures only",
  new_and_existing_failures: "new and existing failures",
  failed_unclassified: "not classified (no baseline)",
  not_completed: "did not complete",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const text = (value: unknown) =>
  typeof value === "string" ? value : undefined;
const number = (value: unknown) =>
  typeof value === "number" ? value : undefined;

function formatDiagnostic(diagnostic: Record<string, unknown>) {
  const location = [
    text(diagnostic.file),
    number(diagnostic.line),
    number(diagnostic.column),
  ]
    .filter((part) => part !== undefined)
    .join(":");
  const origin = text(diagnostic.origin);
  const code = text(diagnostic.code);
  return [
    location || "(no location)",
    origin ? `[${origin}]` : "",
    text(diagnostic.severity) === "warning" ? "warning" : "",
    code ?? "",
    text(diagnostic.message) ?? "",
  ]
    .filter(Boolean)
    .join("  ");
}

function checkRow(check: Record<string, unknown>): CheckRow {
  const diagnostics = Array.isArray(check.diagnostics)
    ? check.diagnostics.filter(isRecord)
    : [];
  const output = isRecord(check.output)
    ? [text(check.output.stdout), text(check.output.stderr)]
        .filter(Boolean)
        .join("\n")
        .trim()
    : "";
  const verdict = text(check.verdict);
  return {
    id: text(check.id) ?? "check",
    command: text(check.command) ?? "",
    status: text(check.status) ?? "unknown",
    durationMs: number(check.durationMs),
    ...(verdict && VERDICTS[verdict]
      ? { verdictLabel: VERDICTS[verdict] }
      : {}),
    revisionChanged: check.revisionChanged === true,
    diagnosticCount: number(check.diagnosticCount) ?? diagnostics.length,
    diagnostics: diagnostics.map(formatDiagnostic),
    ...(output ? { output } : {}),
    ...(text(check.commandId) ? { commandId: text(check.commandId) } : {}),
  };
}

export function summarizeRunChecks(output: unknown): RunChecksSummary | null {
  if (
    !isRecord(output) ||
    output.success !== true ||
    !Array.isArray(output.checks)
  )
    return null;
  const checks = output.checks.filter(isRecord);
  const note = text(output.note);
  if (!checks.some((check) => "status" in check)) {
    return {
      kind: "list",
      rows: checks.map((check) => {
        const latest = isRecord(check.latest) ? check.latest : undefined;
        return {
          id: text(check.id) ?? "check",
          command: text(check.command) ?? "",
          ...(latest
            ? {
                latest: `${text(latest.status) ?? "unknown"}${latest.current === true ? " (current)" : " (stale)"}`,
              }
            : {}),
        };
      }),
      ...(note ? { note } : {}),
    };
  }
  const rows = checks.map(checkRow);
  const revision = text(output.revision);
  return {
    kind: "run",
    rows,
    passed: rows.filter((row) => row.status === "passed").length,
    failed: rows.filter((row) => row.status === "failed").length,
    incomplete: rows.filter(
      (row) => row.status !== "passed" && row.status !== "failed",
    ).length,
    ...(revision ? { revision: revision.slice(0, 10) } : {}),
    allPassed: output.passed === true,
    ...(note ? { note } : {}),
  };
}
