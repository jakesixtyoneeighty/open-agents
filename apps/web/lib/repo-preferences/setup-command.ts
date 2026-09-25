import type { Sandbox } from "@open-agents/sandbox";

// Leaves headroom under the 300s function limit for the rest of provisioning.
export const REPO_SETUP_COMMAND_TIMEOUT_MS = 240_000;

const OUTPUT_TAIL_LENGTH = 2000;

export type RepoSetupCommandResult =
  | { status: "skipped" }
  | { status: "succeeded" }
  | { status: "failed"; exitCode: number | null; output: string };

function tail(value: string): string {
  return value.length > OUTPUT_TAIL_LENGTH
    ? value.slice(-OUTPUT_TAIL_LENGTH)
    : value;
}

/**
 * Runs the repository's saved setup command in the workspace. A failure is
 * returned rather than thrown so the sandbox stays usable; the agent is told
 * the command exists and can re-run it.
 */
export async function runRepoSetupCommand(params: {
  sandbox: Pick<Sandbox, "exec" | "workingDirectory">;
  command: string | null | undefined;
}): Promise<RepoSetupCommandResult> {
  const command = params.command?.trim();
  if (!command) return { status: "skipped" };

  try {
    const result = await params.sandbox.exec(
      command,
      params.sandbox.workingDirectory,
      REPO_SETUP_COMMAND_TIMEOUT_MS,
    );
    if (result.success) return { status: "succeeded" };
    return {
      status: "failed",
      exitCode: result.exitCode,
      output: tail(result.stderr || result.stdout),
    };
  } catch (error) {
    return {
      status: "failed",
      exitCode: null,
      output: error instanceof Error ? error.message : String(error),
    };
  }
}
