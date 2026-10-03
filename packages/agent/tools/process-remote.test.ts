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
      JSON.stringify({
        success: true,
        log: {
          stream: "stdout",
          content: "\u0001".repeat(16000),
          offset: 0,
          totalCharacters: 16000,
          truncated: false,
        },
      }),
    exec: async (command: string) => {
      commands.push(command);
      return {
        success: !(interrupted && command.includes(".result")),
        stdout: "Truncated stdout must not be parsed",
        stderr: "",
      };
    },
  }),
}));
const { executeProcess } = await import("./process-remote");
const { processTool } = await import("./process");
const { bashTool } = await import("./bash");
const { commandOutputTool } = await import("./command-output");
const { processInputSchema } = await import("./process-schema");
const context = {
  browserScope: "session:chat:build",
  model: {},
  sandbox: { state: { type: "vercel" } },
};
const options = {
  experimental_context: context,
  toolCallId: "call-1",
  messages: [],
};
beforeEach(() => {
  writes.clear();
  commands.length = 0;
  interrupted = false;
});

test("managed processes require a host scope and reject invalid inputs", async () => {
  expect((await executeProcess({ action: "list" }, {}, "id")).error).toContain(
    "host did not supply",
  );
  for (const input of [
    { action: "stop", processId: "../foreign" },
    { action: "wait", processId: "a".repeat(64), timeoutSeconds: 31 },
    { action: "start", command: "ls", timeoutSeconds: 21601 },
    {
      action: "start",
      command: "ls",
      readiness: { kind: "http", url: "http://example.com" },
    },
  ])
    expect(processInputSchema.safeParse(input).success).toBe(false);
});

test("commands travel in SDK files, retry IDs are stable and scope changes ownership", async () => {
  const input = {
    action: "start" as const,
    command: "printf '%s' '$(id) `id` 😀'",
    timeoutSeconds: 60,
  };
  const first = await executeProcess(input, context, "same-call");
  expect(first.log?.content).toHaveLength(16000);
  const requests = () =>
    [...writes.entries()].filter(([file]) => file.includes("/request-"));
  const request = requests()[0]!;
  expect(JSON.parse(request[1]).input.command).toBe(input.command);
  expect(commands.join("\n")).not.toContain(input.command);
  await executeProcess(input, context, "same-call");
  expect(JSON.parse(requests()[1]![1]).id).toBe(JSON.parse(request[1]).id);
  await executeProcess(
    input,
    { ...context, browserScope: "another-chat" },
    "same-call",
  );
  expect(JSON.parse(requests()[2]![1]).id).not.toBe(JSON.parse(request[1]).id);
  expect(requests()[2]![0].split("/request-")[0]).not.toBe(
    request[0].split("/request-")[0],
  );
  expect(
    commands
      .filter((command) => command.includes("flock"))
      .every((command) => !command.includes("/request-")),
  ).toBe(true);
});

test("interrupted launch reports stable recovery ID and never claims it failed to start", async () => {
  interrupted = true;
  const result = await executeProcess(
    { action: "start", command: "sleep 5", timeoutSeconds: 60 },
    context,
    "call",
  );
  expect(result.success).toBe(false);
  expect(result.error).toContain("outcome may be unknown");
  expect(result.error).toContain("Launch process ID:");
  expect(commands.at(-1)).toStartWith("rm -f --");
});

test("managed log IDs use scoped retrieval and detached bash uses the controller", async () => {
  const result = await commandOutputTool.execute?.(
    {
      commandId: `process:${"a".repeat(64)}`,
      stream: "stdout",
      offset: 0,
      limit: 8000,
    },
    options,
  );
  expect(result).toMatchObject({
    success: true,
    offset: 0,
    content: "\u0001".repeat(16000),
  });
  await bashTool().execute?.({ command: "pnpm dev", detached: true }, options);
  const requests = [...writes.entries()]
    .filter(([file]) => file.includes("/request-"))
    .map(([, value]) => JSON.parse(value));
  expect(requests.map((request) => request.input.action)).toEqual([
    "logs",
    "start",
  ]);
});

test("process start preserves shell command approval requirements", async () => {
  const approval = processTool.needsApproval;
  if (typeof approval !== "function")
    throw new Error("Missing approval function");
  expect(
    await approval(
      { action: "start", command: "cat .env", timeoutSeconds: 60 },
      options,
    ),
  ).toBe(true);
  expect(
    await approval(
      { action: "start", command: "rm -rf data", timeoutSeconds: 60 },
      options,
    ),
  ).toBe(true);
  expect(
    await approval(
      { action: "start", command: "pnpm dev", timeoutSeconds: 60 },
      options,
    ),
  ).toBe(false);
  expect(
    await approval({ action: "stop", processId: "a".repeat(64) }, options),
  ).toBe(false);
});
