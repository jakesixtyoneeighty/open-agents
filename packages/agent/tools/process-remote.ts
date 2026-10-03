import { createHash, randomUUID } from "node:crypto";
import { getBrowserScope } from "./browser";
import { PROCESS_CLIENT } from "./process-client";
import { PROCESS_RUNNER } from "./process-runner";
import { PROCESS_WORKER } from "./process-worker";
import {
  processInputSchema,
  processOutputSchema,
  type ProcessInput,
  type ProcessOutput,
} from "./process-schema";
import { getSandbox, shellEscape } from "./utils";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function executeProcess(
  rawInput: ProcessInput,
  context: unknown,
  toolCallId: string,
  signal?: AbortSignal,
): Promise<ProcessOutput> {
  try {
    const input = processInputSchema.parse(rawInput);
    // Reuse the host's session/chat/build/task scope already threaded through
    // all agents for browser verification. Never accept ownership in tool input.
    const scope = getBrowserScope(context);
    if (!scope)
      throw new Error(
        "Process control unavailable: the host did not supply a chat/task scope.",
      );
    const sandbox = await getSandbox(context, "process");
    const id = hash(`${scope}:process:${toolCallId}`);
    const store = `${sandbox.stateDirectory ?? "/var/tmp/open-agents"}/processes/${hash(scope).slice(0, 24)}`;
    const version = hash(
      PROCESS_CLIENT + PROCESS_RUNNER + PROCESS_WORKER,
    ).slice(0, 12);
    const client = `${store}/client-${version}.mjs`;
    const worker = `${store}/worker-${version}.mjs`;
    const runner = `${store}/runner-${version}.mjs`;
    const request = `${store}/request-${randomUUID()}`;
    const output = `${request}.result`;
    const run = async (command: string, timeout = 15000) => {
      const result = await sandbox.exec(
        command,
        sandbox.workingDirectory,
        timeout,
        { signal },
      );
      if (!result.success)
        throw new Error(
          `Process transport interrupted or unavailable; outcome may be unknown. Recover status before launching again. ${result.stderr.slice(0, 300)}`,
        );
    };
    await run(`mkdir -p -m 700 ${shellEscape(store)}`);
    const suffix = randomUUID();
    for (const [file, content] of [
      [client, PROCESS_CLIENT],
      [worker, PROCESS_WORKER],
      [runner, PROCESS_RUNNER],
    ] as const) {
      await sandbox.writeFile(`${file}.${suffix}`, content, "utf-8");
      await run(
        `mv -- ${shellEscape(`${file}.${suffix}`)} ${shellEscape(file)}`,
      );
    }
    try {
      const args = [client, store, worker, runner].map(shellEscape).join(" ");
      await run(
        `flock -w 10 ${shellEscape(`${store}/startup.lock`)} node ${args}`,
        20000,
      );
      await sandbox.writeFile(
        request,
        JSON.stringify({ input, id, root: sandbox.workingDirectory }),
        "utf-8",
      );
      await run(
        `node ${args} ${shellEscape(request)} ${shellEscape(output)}`,
        40000,
      );
      const result = processOutputSchema.parse(
        JSON.parse(await sandbox.readFile(output, "utf-8")),
      );
      if (!result.success && input.action === "start") {
        result.error = `${result.error ?? "Process request failed."} Launch process ID: ${id}. Recover status before starting another job.`;
      }
      return result;
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}${input.action === "start" ? ` Launch process ID: ${id}. Retry this same call to recover it; do not start a new call blindly.` : ""}`,
        { cause: error },
      );
    } finally {
      await sandbox
        .exec(
          `rm -f -- ${shellEscape(request)} ${shellEscape(output)}`,
          sandbox.workingDirectory,
          10000,
        )
        .catch(() => {});
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
