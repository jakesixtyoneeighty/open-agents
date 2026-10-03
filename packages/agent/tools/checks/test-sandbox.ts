import { spawn } from "node:child_process";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import type { ExecResult, Sandbox } from "@open-agents/sandbox";

/** A real-filesystem, real-shell sandbox for check tests. */
export function createLocalCheckSandbox(
  workingDirectory: string,
  stateDirectory: string,
) {
  let commands = 0;
  const exec = (
    command: string,
    cwd: string,
    timeoutMs: number,
    options?: {
      signal?: AbortSignal;
      outputLimit?: number;
      fullOutputLimit?: number;
    },
  ) =>
    new Promise<ExecResult>((resolve, reject) => {
      const child = spawn("bash", ["-c", command], { cwd, detached: true });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      const timer = setTimeout(() => {
        timedOut = true;
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      }, timeoutMs);
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          success: !timedOut && code === 0,
          exitCode: timedOut ? null : code,
          stdout: options?.outputLimit
            ? stdout.slice(0, options.outputLimit)
            : stdout,
          stderr: timedOut
            ? `Command timed out after ${timeoutMs}ms`
            : options?.outputLimit
              ? stderr.slice(0, options.outputLimit)
              : stderr,
          truncated: false,
          ...(timedOut ? { timedOut: true } : {}),
          ...(options?.outputLimit ? { commandId: `cmd-${++commands}` } : {}),
          ...(options?.fullOutputLimit
            ? { fullOutput: { stdout, stderr, truncated: false } }
            : {}),
        });
      });
    });
  return {
    type: "cloud",
    workingDirectory,
    stateDirectory,
    exec,
    readFile: (file: string) => readFile(file, "utf8"),
    writeFile: (file: string, content: string) => writeFile(file, content),
    mkdir: async (dir: string, options?: { recursive?: boolean }) => {
      await mkdir(dir, options);
    },
    access: (file: string) => access(file),
    stat: (file: string) => stat(file),
  } as unknown as Sandbox;
}
