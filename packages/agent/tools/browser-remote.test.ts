import { beforeEach, expect, mock, test } from "bun:test";

const writes = new Map<string, string>();
const commands: string[] = [];
let interrupted = false;
mock.module("@open-agents/sandbox", () => ({
  connectSandbox: async () => ({
    workingDirectory: "/workspace",
    writeFile: async (path: string, content: string) => {
      writes.set(path, content);
    },
    readFile: async () =>
      JSON.stringify({ success: true, snapshot: "\u0001".repeat(12000) }),
    exec: async (command: string) => {
      commands.push(command);
      if (command.includes("client.lock"))
        return {
          success: !interrupted,
          stdout: "truncated command output must not be parsed",
          stderr: "",
        };
      return {
        success: true,
        stdout: command === 'printf %s "$HOME"' ? "/home/test" : "",
        stderr: "",
      };
    },
  }),
}));
const { executeBrowser } = await import("./browser");
const context = {
  browserScope: "chat-1:build",
  model: {},
  sandbox: { state: { type: "vercel" } },
};
beforeEach(() => {
  commands.length = 0;
  writes.clear();
  interrupted = false;
});

test("remote transport sends input only in files and scopes both locks and replay IDs", async () => {
  const input = {
    sessionId: crypto.randomUUID(),
    action: { kind: "fill", value: "$(touch /tmp/injected) `id` ' 😀" },
  };
  expect(
    (await executeBrowser("action", input, context, "call-1")).success,
  ).toBe(true);
  expect(
    (await executeBrowser("inspect", {}, context, "large-output")).snapshot,
  ).toHaveLength(12000);
  const first = [...writes.entries()].find(([path]) =>
    path.includes("/request-"),
  );
  expect(first).toBeDefined();
  expect(JSON.parse(first![1]).input).toEqual(input);
  expect(commands.join("\n")).not.toContain(input.action.value);
  expect(commands.some((command) => command.includes("flock -w 60"))).toBe(
    true,
  );
  const firstId: unknown = JSON.parse(first![1]).id;
  writes.clear();
  await executeBrowser(
    "action",
    input,
    { ...context, browserScope: "chat-2:build" },
    "call-1",
  );
  const second = [...writes.entries()].find(([path]) =>
    path.includes("/request-"),
  );
  expect(first![0].split("/request-")[0]).not.toBe(
    second![0].split("/request-")[0],
  );
  expect(firstId).not.toBe(JSON.parse(second![1]).id);
});

test("interrupted remote calls report unknown outcomes and clean request files", async () => {
  interrupted = true;
  const result = await executeBrowser("action", {}, context, "call-1");
  expect(result.success).toBe(false);
  expect(result.error).toContain("outcome may be unknown");
  expect(commands.at(-1)).toStartWith("rm -f --");
});
