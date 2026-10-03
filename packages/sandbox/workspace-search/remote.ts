import { createHash, randomUUID } from "node:crypto";
import type { Sandbox as VercelSandboxSDK } from "@vercel/sandbox";
import type { WorkspaceSearchRequest, WorkspaceSearchResult } from "./types";
import { WORKSPACE_SEARCH_WORKER } from "./worker-source";

type Session = ReturnType<
  InstanceType<typeof VercelSandboxSDK>["currentSession"]
>;

const SEARCH_ID = /^[a-f0-9]{32,64}$/;

export function workspaceSearchStore(root: string) {
  const key = createHash("sha256").update(root).digest("hex");
  return `/var/tmp/open-agents-search/${key}`;
}

export async function runRemoteWorkspaceSearch(
  session: Session,
  root: string,
  request: WorkspaceSearchRequest,
  signal?: AbortSignal,
): Promise<WorkspaceSearchResult> {
  if (!SEARCH_ID.test(request.id))
    return { success: false, error: "Invalid search id." };
  const store = workspaceSearchStore(root);
  const inputPath = `${store}/request-${randomUUID()}.json`;
  const outputPath = `${inputPath}.result`;
  try {
    const setup = await session.runCommand({
      cmd: "mkdir",
      args: ["-p", "-m", "700", store],
      signal,
    });
    if (setup.exitCode !== 0)
      throw new Error("Could not prepare search storage.");
    await session.writeFiles([
      { path: inputPath, content: Buffer.from(JSON.stringify(request)) },
    ]);
    // Each result set has its own lock so a page never races its own resumed scan.
    const execution = await session.runCommand({
      cmd: "flock",
      args: [
        "-w",
        "30",
        `${store}/${request.id}.lock`,
        "node",
        "-e",
        WORKSPACE_SEARCH_WORKER,
        root,
        store,
        inputPath,
        outputPath,
      ],
      signal,
    });
    if (execution.exitCode !== 0) {
      throw new Error(
        "Search worker could not complete or acquire its lock. Narrow the search or retry.",
      );
    }
    const output = await session.readFileToBuffer({ path: outputPath });
    if (!output) throw new Error("Search result is unavailable; retry.");
    return JSON.parse(output.toString("utf8")) as WorkspaceSearchResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Search failed",
    };
  } finally {
    await session
      .runCommand({ cmd: "rm", args: ["-f", "--", inputPath, outputPath] })
      .catch(() => {});
  }
}
