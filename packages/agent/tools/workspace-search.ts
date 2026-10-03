import { createHash, randomUUID } from "node:crypto";
import * as path from "path";
import type {
  WorkspaceSearchQuery,
  WorkspaceSearchRequest,
  WorkspaceSearchResult,
} from "@open-agents/sandbox";
import { resolveWorkspacePath } from "./path-security";
import { getSandbox } from "./utils";

export const SEARCH_PAGE_DEFAULT = 100;
export const SEARCH_PAGE_MAX = 500;

type SearchSuccess = Extract<WorkspaceSearchResult, { success: true }>;
type SearchKind = WorkspaceSearchQuery["kind"];

const CURSOR = /^s1\.([a-f0-9]{64})\.(\d{1,9})$/;

export function encodeSearchCursor(searchId: string, offset: number) {
  return `s1.${searchId}.${offset}`;
}

export function decodeSearchCursor(cursor: string) {
  const match = CURSOR.exec(cursor);
  if (!match?.[1] || !match[2]) return null;
  return { searchId: match[1], offset: Number(match[2]) };
}

/** Workspace-relative POSIX path for the worker, or null when outside the workspace. */
export function toWorkspaceSearchPath(
  input: string | undefined,
  workingDirectory: string,
): string | null {
  if (!input || input === ".") return "";
  const absolutePath = resolveWorkspacePath(input, workingDirectory);
  if (!absolutePath) return null;
  return path
    .relative(workingDirectory, absolutePath)
    .split(path.sep)
    .join("/");
}

export function clampSearchLimit(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit))
    return SEARCH_PAGE_DEFAULT;
  return Math.min(SEARCH_PAGE_MAX, Math.max(1, Math.floor(limit)));
}

/**
 * Starts a search or continues one from its cursor. Continuations read stored
 * entries (or resume the stored scan) and never rerun earlier pages.
 */
export async function runWorkspaceSearch(params: {
  context: unknown;
  toolName: "grep" | "glob";
  kind: SearchKind;
  limit: number | undefined;
  cursor: string | undefined;
  abortSignal: AbortSignal | undefined;
  buildQuery: (
    workingDirectory: string,
  ) => WorkspaceSearchQuery | { error: string };
}): Promise<WorkspaceSearchResult> {
  try {
    const sandbox = await getSandbox(params.context, params.toolName);
    if (!sandbox.searchWorkspace) {
      return {
        success: false,
        error: "This sandbox does not support workspace search.",
      };
    }
    const limit = clampSearchLimit(params.limit);
    let request: WorkspaceSearchRequest;
    if (params.cursor !== undefined) {
      const decoded = decodeSearchCursor(params.cursor);
      if (!decoded) {
        return {
          success: false,
          error: `Invalid cursor. Pass nextCursor exactly as an earlier ${params.toolName} result returned it.`,
        };
      }
      request = {
        id: decoded.searchId,
        action: "page",
        offset: decoded.offset,
        limit,
      };
    } else {
      const query = params.buildQuery(sandbox.workingDirectory);
      if ("error" in query) return { success: false, error: query.error };
      request = {
        id: createHash("sha256").update(randomUUID()).digest("hex"),
        action: "search",
        limit,
        query,
      };
    }
    const result = await sandbox.searchWorkspace(request, {
      signal: params.abortSignal,
    });
    if (result.success && result.query.kind !== params.kind) {
      return {
        success: false,
        error: `This cursor belongs to a ${result.query.kind === "files" ? "glob" : "grep"} search; pass it to that tool.`,
      };
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `${params.toolName === "grep" ? "Grep" : "Glob"} failed: ${message}`,
    };
  }
}

/** Shared continuation and completeness fields for grep and glob results. */
export function searchStatus(result: SearchSuccess) {
  const notes: string[] = [];
  if (result.incompleteReason === "time_limit") {
    notes.push(
      `Scan paused after ${result.scannedFiles} of ${result.candidateFiles} files; totals are lower bounds. Pass nextCursor to continue scanning.`,
    );
  } else if (result.incompleteReason === "result_limit") {
    notes.push(
      `Stored results reached their size limit after ${result.scannedFiles} of ${result.candidateFiles} files; later files were not searched. Narrow path or glob, or use output "files".`,
    );
  } else if (result.nextOffset !== undefined) {
    notes.push("More results are stored; pass nextCursor for the next page.");
  }
  if (!result.respectsGitignore && !result.query.includeIgnored) {
    notes.push(
      "Git was unavailable, so gitignored files were not filtered (node_modules and hidden paths still were).",
    );
  }
  const skipped = Object.fromEntries(
    Object.entries(result.skipped).filter(([, value]) => value && value.count),
  );
  return {
    returned: result.entries.length,
    complete: result.complete,
    ...(result.incompleteReason
      ? { incompleteReason: result.incompleteReason }
      : {}),
    ...(result.nextOffset !== undefined
      ? { nextCursor: encodeSearchCursor(result.searchId, result.nextOffset) }
      : {}),
    ...(Object.keys(skipped).length ? { skipped } : {}),
    ...(notes.length ? { note: notes.join(" ") } : {}),
  };
}
