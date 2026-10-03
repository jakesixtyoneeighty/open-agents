import { createHash } from "node:crypto";
import * as path from "path";
import type { Sandbox } from "@open-agents/sandbox";
import type { CheckHistory, CheckRecord } from "./types";

const MAX_RUNS = 20;

const digest = (value: string, length: number) =>
  createHash("sha256").update(value).digest("hex").slice(0, length);

/** One history file per command and directory, outside the workspace. */
function historyPath(sandbox: Sandbox, cwd: string, command: string) {
  if (!sandbox.stateDirectory) return null;
  return path.posix.join(
    sandbox.stateDirectory,
    "checks",
    digest(sandbox.workingDirectory, 16),
    `${digest(`${cwd}\u0000${command}`, 24)}.json`,
  );
}

function isHistory(value: unknown): value is CheckHistory {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === 1 &&
    Array.isArray((value as { runs?: unknown }).runs)
  );
}

export async function loadCheckHistory(
  sandbox: Sandbox,
  cwd: string,
  command: string,
): Promise<CheckHistory | null> {
  const file = historyPath(sandbox, cwd, command);
  if (!file) return null;
  try {
    const parsed: unknown = JSON.parse(await sandbox.readFile(file, "utf-8"));
    return isHistory(parsed) ? parsed : { version: 1, runs: [] };
  } catch {
    return { version: 1, runs: [] };
  }
}

/**
 * The comparison point for new vs existing failures: the latest run on a
 * clean working tree, else the earliest recorded run (which may already
 * include uncommitted changes).
 */
export function selectBaseline(history: CheckHistory | null) {
  if (history?.baseline) return { record: history.baseline, clean: true };
  if (history?.first) return { record: history.first, clean: false };
  return null;
}

/** Returns false when history is unavailable; checks still report results. */
export async function saveCheckRecord(
  sandbox: Sandbox,
  history: CheckHistory | null,
  record: CheckRecord,
): Promise<boolean> {
  const file = historyPath(sandbox, record.cwd, record.command);
  if (!file || !history) return false;
  // Only completed runs describe the code; timeouts and launch errors do not.
  const completed = record.status === "passed" || record.status === "failed";
  const stable =
    completed &&
    record.revision !== null &&
    record.revision === record.revisionAfter;
  const baseline = stable && !record.dirty ? record : history.baseline;
  const first = history.first ?? (completed ? record : undefined);
  const next: CheckHistory = {
    version: 1,
    ...(baseline ? { baseline } : {}),
    ...(first ? { first } : {}),
    runs: [...history.runs, record].slice(-MAX_RUNS),
  };
  try {
    await sandbox.mkdir(path.posix.dirname(file), { recursive: true });
    await sandbox.writeFile(file, JSON.stringify(next), "utf-8");
    return true;
  } catch {
    return false;
  }
}
