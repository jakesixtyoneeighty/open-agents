import { describe, expect, test } from "bun:test";
import type { ExecResult } from "@open-agents/sandbox";
import {
  REPO_SETUP_COMMAND_TIMEOUT_MS,
  runRepoSetupCommand,
} from "./setup-command";

function fakeSandbox(result: ExecResult | Error) {
  const calls: Array<{ command: string; cwd: string; timeoutMs?: number }> = [];
  return {
    calls,
    sandbox: {
      workingDirectory: "/vercel/sandbox",
      exec: async (command: string, cwd: string, timeoutMs?: number) => {
        calls.push({ command, cwd, timeoutMs });
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
}

const ok: ExecResult = {
  success: true,
  exitCode: 0,
  stdout: "",
  stderr: "",
  truncated: false,
};

describe("runRepoSetupCommand", () => {
  test("skips blank commands without touching the sandbox", async () => {
    const { sandbox, calls } = fakeSandbox(ok);
    expect(await runRepoSetupCommand({ sandbox, command: "  " })).toEqual({
      status: "skipped",
    });
    expect(await runRepoSetupCommand({ sandbox, command: null })).toEqual({
      status: "skipped",
    });
    expect(calls).toHaveLength(0);
  });

  test("runs in the working directory with the timeout", async () => {
    const { sandbox, calls } = fakeSandbox(ok);
    expect(
      await runRepoSetupCommand({ sandbox, command: "pnpm install" }),
    ).toEqual({ status: "succeeded" });
    expect(calls).toEqual([
      {
        command: "pnpm install",
        cwd: "/vercel/sandbox",
        timeoutMs: REPO_SETUP_COMMAND_TIMEOUT_MS,
      },
    ]);
  });

  test("reports failures with the tail of the output", async () => {
    const { sandbox } = fakeSandbox({
      ...ok,
      success: false,
      exitCode: 1,
      stderr: `${"x".repeat(5000)}END`,
    });
    const result = await runRepoSetupCommand({ sandbox, command: "false" });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.exitCode).toBe(1);
      expect(result.output.length).toBe(2000);
      expect(result.output.endsWith("END")).toBe(true);
    }
  });

  test("does not throw when exec throws", async () => {
    const { sandbox } = fakeSandbox(new Error("stream closed"));
    expect(await runRepoSetupCommand({ sandbox, command: "make" })).toEqual({
      status: "failed",
      exitCode: null,
      output: "stream closed",
    });
  });
});
