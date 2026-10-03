import { expect, test } from "bun:test";
import { runRemoteWorkspaceSearch, workspaceSearchStore } from "./remote";

const searchId = "a".repeat(64);

test("remote searches send queries as SDK payload files under a per-search lock", async () => {
  const commands: { cmd: string; args: string[] }[] = [];
  let payload = "";
  const result = {
    success: false as const,
    error: "stored",
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
  } as unknown as Parameters<typeof runRemoteWorkspaceSearch>[0];
  const request = {
    id: searchId,
    action: "search" as const,
    limit: 10,
    query: {
      kind: "content" as const,
      path: "",
      pattern: "$(never-execute)",
      mode: "literal" as const,
      caseSensitive: true,
      output: "content" as const,
      before: 0,
      after: 0,
      includeHidden: false,
      includeIgnored: false,
    },
  };
  expect(await runRemoteWorkspaceSearch(session, "/repo", request)).toEqual(
    result,
  );
  const worker = commands.find((command) => command.cmd === "flock");
  expect(worker?.args.slice(0, 3)).toEqual([
    "-w",
    "30",
    `${workspaceSearchStore("/repo")}/${searchId}.lock`,
  ]);
  expect(JSON.stringify(commands)).not.toContain("never-execute");
  expect(JSON.parse(payload)).toEqual(request);
  expect(commands.at(-1)?.cmd).toBe("rm");
});

test("invalid ids and failed workers return explicit errors", async () => {
  const session = {
    runCommand: async ({ cmd }: { cmd: string }) => ({
      exitCode: cmd === "flock" ? 1 : 0,
    }),
    writeFiles: async () => {},
  } as unknown as Parameters<typeof runRemoteWorkspaceSearch>[0];
  expect(
    await runRemoteWorkspaceSearch(session, "/repo", {
      id: "../escape",
      action: "page",
      offset: 0,
      limit: 1,
    }),
  ).toEqual({ success: false, error: "Invalid search id." });
  expect(
    await runRemoteWorkspaceSearch(session, "/repo", {
      id: searchId,
      action: "page",
      offset: 0,
      limit: 1,
    }),
  ).toMatchObject({ success: false, error: expect.stringContaining("lock") });
});
