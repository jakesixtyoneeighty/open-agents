import { expect, test } from "bun:test";
import { runRemoteWorkspaceEdit, runRemoteWorkspaceHistory } from "./remote";

test("remote edits use an OS lock, SDK payload files and untruncated result reads", async () => {
  const commands: { cmd: string; args: string[] }[] = [];
  let payload = "";
  const content = "large source\n".repeat(10_000);
  const result = {
    success: true as const,
    changeSetId: "a".repeat(64),
    dryRun: false,
    replacements: 0,
    changes: [
      {
        path: "a",
        before: null,
        after: content,
        beforeRevision: null,
        afterRevision: "b".repeat(64),
      },
    ],
  };
  const session = {
    runCommand: async (command: { cmd: string; args: string[] }) => {
      commands.push(command);
      return { exitCode: 0 };
    },
    writeFiles: async (files: { content: Buffer }[]) => {
      payload = files[0]?.content.toString() ?? "";
    },
    readFileToBuffer: async () => Buffer.from(JSON.stringify(result)),
  } as unknown as Parameters<typeof runRemoteWorkspaceEdit>[0];
  const request = {
    id: "a".repeat(64),
    operations: [
      {
        kind: "create" as const,
        path: "a",
        content: "literal $(never-execute)",
      },
    ],
  };
  expect(await runRemoteWorkspaceEdit(session, "/repo", request)).toEqual(
    result,
  );
  expect(
    commands.some(
      (command) => command.cmd === "flock" && command.args.includes("node"),
    ),
  ).toBe(true);
  expect(JSON.stringify(commands)).not.toContain("never-execute");
  expect(JSON.parse(payload)).toEqual(request);
  expect(commands.at(-1)?.cmd).toBe("rm");
});

test("missing lock/runtime or lost execution result reports an uncertain failure", async () => {
  const session = {
    runCommand: async ({ cmd }: { cmd: string }) => ({
      exitCode: cmd === "flock" ? 1 : 0,
    }),
    writeFiles: async () => {},
  } as unknown as Parameters<typeof runRemoteWorkspaceEdit>[0];
  const result = await runRemoteWorkspaceEdit(session, "/repo", {
    id: "a".repeat(64),
    operations: [{ kind: "create", path: "a", content: "a" }],
  });
  expect(result).toMatchObject({ success: false, changeSetId: "a".repeat(64) });
});

test("history reads share the locked worker transport and report lost results", async () => {
  const commands: { cmd: string }[] = [];
  let payload = "";
  const listed = {
    success: true as const,
    history: "list" as const,
    entries: [],
    retention: {
      maxEntries: 200,
      maxBytes: 1,
      entries: 0,
      bytes: 0,
      pruned: 0,
    },
    recoveryRequired: [],
  };
  const session = {
    runCommand: async (command: { cmd: string }) => {
      commands.push(command);
      return { exitCode: 0 };
    },
    writeFiles: async (files: { content: Buffer }[]) => {
      payload = files[0]?.content.toString() ?? "";
    },
    readFileToBuffer: async () => Buffer.from(JSON.stringify(listed)),
  } as unknown as Parameters<typeof runRemoteWorkspaceHistory>[0];
  expect(
    await runRemoteWorkspaceHistory(session, "/repo", { history: "list" }),
  ).toEqual(listed);
  expect(JSON.parse(payload)).toEqual({ history: "list" });
  expect(commands.map((command) => command.cmd)).toEqual([
    "mkdir",
    "flock",
    "rm",
  ]);

  const lost = {
    ...session,
    readFileToBuffer: async () => null,
  } as unknown as Parameters<typeof runRemoteWorkspaceHistory>[0];
  expect(
    await runRemoteWorkspaceHistory(lost, "/repo", { history: "list" }),
  ).toMatchObject({
    success: false,
    error: expect.stringContaining("unavailable"),
  });
});
