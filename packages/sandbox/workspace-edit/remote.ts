import { createHash, randomUUID } from "node:crypto";
import type { Sandbox as VercelSandboxSDK } from "@vercel/sandbox";
import type {
  WorkspaceEditRequest,
  WorkspaceEditResult,
  WorkspaceHistoryRequest,
  WorkspaceHistoryResult,
} from "./types";
import { WORKSPACE_EDIT_WORKER } from "./worker-source";

type Session = ReturnType<
  InstanceType<typeof VercelSandboxSDK>["currentSession"]
>;

/** Runs the edit worker under its workspace lock and returns its parsed result. */
async function runEditWorker(
  session: Session,
  root: string,
  request: WorkspaceEditRequest | WorkspaceHistoryRequest,
): Promise<unknown> {
  const key = createHash("sha256").update(root).digest("hex");
  const store = `/var/tmp/open-agents-edits/${key}`;
  const inputPath = `${store}/request-${randomUUID()}.json`;
  const outputPath = `${inputPath}.result`;
  try {
    const setup = await session.runCommand({
      cmd: "mkdir",
      args: ["-p", "-m", "700", store],
    });
    if (setup.exitCode !== 0)
      throw new Error("Could not prepare edit journal.");
    await session.writeFiles([
      { path: inputPath, content: Buffer.from(JSON.stringify(request)) },
    ]);
    const execution = await session.runCommand({
      cmd: "flock",
      args: [
        "-w",
        "30",
        `${store}/workspace.lock`,
        "node",
        "-e",
        WORKSPACE_EDIT_WORKER,
        root,
        store,
        inputPath,
        outputPath,
      ],
    });
    if (execution.exitCode !== 0) {
      throw new Error(
        "Edit worker could not complete or acquire its lock. Retry the same operation to reconcile its journal.",
      );
    }
    const output = await session.readFileToBuffer({ path: outputPath });
    if (!output)
      throw new Error("Edit result is unavailable; retry the same operation.");
    return JSON.parse(output.toString("utf8"));
  } finally {
    await session
      .runCommand({ cmd: "rm", args: ["-f", "--", inputPath, outputPath] })
      .catch(() => {});
  }
}

export async function runRemoteWorkspaceEdit(
  session: Session,
  root: string,
  request: WorkspaceEditRequest,
): Promise<WorkspaceEditResult> {
  try {
    return (await runEditWorker(session, root, request)) as WorkspaceEditResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Edit failed",
      changeSetId: request.id,
    };
  }
}

export async function runRemoteWorkspaceHistory(
  session: Session,
  root: string,
  request: WorkspaceHistoryRequest,
): Promise<WorkspaceHistoryResult> {
  try {
    return (await runEditWorker(
      session,
      root,
      request,
    )) as WorkspaceHistoryResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "History unavailable",
    };
  }
}
