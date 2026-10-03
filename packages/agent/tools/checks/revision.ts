import type { Sandbox } from "@open-agents/sandbox";
import { shellEscape } from "../utils";
import type { WorkspaceRevision } from "./types";

/**
 * Hashes the whole working tree (tracked and untracked, honoring .gitignore)
 * into a git tree through a temporary index. The user's index, HEAD and
 * worktree are untouched; only content-addressed objects are written.
 */
const REVISION_SCRIPT = `
top=$(git rev-parse --show-toplevel 2>/dev/null) || { echo NOGIT; exit 0; }
cd "$top" || exit 1
index=$(mktemp) || exit 1
trap 'rm -f "$index" "$index.lock"' EXIT
source=$(git rev-parse --git-path index)
if [ -f "$source" ]; then cp "$source" "$index"; else rm -f "$index"; fi
GIT_INDEX_FILE="$index" git -c core.fsmonitor=false add -A -- . >/dev/null 2>&1 || exit 1
tree=$(GIT_INDEX_FILE="$index" git write-tree) || exit 1
echo "TREE $tree $(git rev-parse -q --verify 'HEAD^{tree}' 2>/dev/null || echo none) $(git rev-parse -q --verify HEAD 2>/dev/null || echo none)"
`;

export async function getWorkspaceRevision(
  sandbox: Sandbox,
  signal?: AbortSignal,
): Promise<WorkspaceRevision> {
  const unavailable = (reason: string): WorkspaceRevision => ({
    revision: null,
    headTree: null,
    headCommit: null,
    dirty: true,
    unavailableReason: reason,
  });
  try {
    const result = await sandbox.exec(
      REVISION_SCRIPT,
      sandbox.workingDirectory,
      60_000,
      { signal },
    );
    const line = result.stdout.trim().split("\n").at(-1) ?? "";
    if (line === "NOGIT")
      return unavailable("The workspace is not a git repository.");
    const match = /^TREE ([0-9a-f]{40,64}) (\S+) (\S+)$/.exec(line);
    if (!result.success || !match?.[1]) {
      return unavailable("Could not hash the working tree with git.");
    }
    const headTree = match[2] === "none" ? null : (match[2] ?? null);
    return {
      revision: match[1],
      headTree,
      headCommit: match[3] === "none" ? null : (match[3] ?? null),
      dirty: match[1] !== headTree,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    return unavailable("Could not hash the working tree with git.");
  }
}

/** Workspace-relative paths that differ from HEAD (modified, added or untracked). */
export async function getChangedFiles(
  sandbox: Sandbox,
  signal?: AbortSignal,
): Promise<Set<string> | null> {
  const result = await sandbox.exec(
    "git diff --name-only -z --relative HEAD && git ls-files -z --others --exclude-standard",
    sandbox.workingDirectory,
    30_000,
    { signal },
  );
  if (!result.success) return null;
  return new Set(result.stdout.split("\0").filter(Boolean));
}

/** Workspace-relative files whose basename is one of `basenames`. */
export async function findFilesByBasename(
  sandbox: Sandbox,
  basenames: string[],
  signal?: AbortSignal,
): Promise<string[] | null> {
  if (basenames.length === 0) return [];
  const pathspecs = basenames
    .slice(0, 100)
    .map((name) =>
      shellEscape(`:(glob)**/${name.replace(/[*?[\]\\]/g, "\\$&")}`),
    );
  const result = await sandbox.exec(
    `git ls-files -z --cached --others --exclude-standard -- ${pathspecs.join(" ")}`,
    sandbox.workingDirectory,
    30_000,
    { signal },
  );
  if (!result.success) return null;
  return result.stdout.split("\0").filter(Boolean);
}
