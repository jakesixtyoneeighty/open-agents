import type { Sandbox } from "@open-agents/sandbox";
import { getRepoPreferencesForSession } from "@/lib/db/repo-preferences";
import {
  type RepoSetupCommandResult,
  runRepoSetupCommand,
} from "./setup-command";

/** Runs the setup command for a session's repo; logs a failure. */
export async function runSessionRepoSetupCommand(params: {
  session: {
    id: string;
    userId: string;
    repoOwner: string | null;
    repoName: string | null;
  };
  sandbox: Pick<Sandbox, "exec" | "workingDirectory">;
}): Promise<RepoSetupCommandResult> {
  let command: string | null = null;
  try {
    const repoPreferences = await getRepoPreferencesForSession(params.session);
    command = repoPreferences?.setupCommand ?? null;
  } catch (error) {
    console.error(
      `Failed to load repository preferences for session ${params.session.id}:`,
      error,
    );
    return { status: "skipped" };
  }

  const result = await runRepoSetupCommand({
    sandbox: params.sandbox,
    command,
  });
  if (result.status === "failed") {
    console.error(
      `Repository setup command failed for session ${params.session.id} (exit ${result.exitCode ?? "unknown"}): ${result.output}`,
    );
  }
  return result;
}
