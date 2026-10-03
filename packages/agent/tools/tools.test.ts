import { createLocalWorkspaceEditor } from "../../sandbox/workspace-edit/test-harness";
import { createLocalWorkspaceSearcher } from "../../sandbox/workspace-search/test-harness";
import { createLocalCheckSandbox } from "./checks/test-sandbox";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ToolNeedsApprovalFunction } from "./utils";

const sandboxRegistry = new Map<string, Record<string, unknown>>();

mock.module("ai", () => {
  class MockToolLoopAgent {
    constructor(_config: unknown) {}

    stream() {
      throw new Error(
        "MockToolLoopAgent.stream should not be called in this test",
      );
    }
  }

  const gateway = (modelId: string) => ({ modelId });

  return {
    tool: <T extends Record<string, unknown>>(definition: T) => definition,
    generateImage: async () => {
      throw new Error("generateImage should not be called in this test");
    },
    gateway,
    createGateway: () => gateway,
    defaultSettingsMiddleware: () => ({}),
    wrapLanguageModel: ({ model }: { model: unknown }) => model,
    stepCountIs: (count: number) => ({ count }),
    ToolLoopAgent: MockToolLoopAgent,
    getToolName: (part: { toolName?: string; type?: string }) => {
      if (part.toolName) {
        return part.toolName;
      }

      if (typeof part.type === "string" && part.type.startsWith("tool-")) {
        return part.type.slice(5);
      }

      return "";
    },
    isToolUIPart: (part: unknown) => {
      if (!part || typeof part !== "object") {
        return false;
      }

      const candidate = part as { type?: unknown };
      return (
        typeof candidate.type === "string" && candidate.type.startsWith("tool-")
      );
    },
  };
});

mock.module("@open-agents/sandbox", () => ({
  connectSandbox: async (state: { sandboxId?: string }) => {
    if (!state.sandboxId) {
      throw new Error("Missing sandboxId in test sandbox state.");
    }

    const sandbox = sandboxRegistry.get(state.sandboxId);
    if (!sandbox) {
      throw new Error(`Unknown test sandbox: ${state.sandboxId}`);
    }

    return sandbox;
  },
  tryConnectVercelSandboxDirect: async () => null,
}));

const { askUserQuestionTool } = await import("./ask-user-question");
const { bashTool, commandNeedsApproval } = await import("./bash");
const { MAX_BODY_LENGTH, isAllowedWebUrl, webFetchTool } =
  await import("./fetch");
const { globTool } = await import("./glob");
const { grepTool } = await import("./grep");
const { readFileTool } = await import("./read");
const { runChecksTool } = await import("./run-checks");
const { skillTool } = await import("./skill");
const { taskTool } = await import("./task");
const { todoWriteTool } = await import("./todo");
const { editFileTool, writeFileTool } = await import("./write");
const { multiEditTool, applyPatchTool, undoEditTool } =
  await import("./workspace-edit");
const { workspaceEditOutputSchema } = await import("./workspace-edit-schema");
const { buildSystemPrompt } = await import("../system-prompt");

function createContext(sandbox: Record<string, unknown>) {
  const sandboxId = `sandbox-${sandboxRegistry.size + 1}`;
  sandboxRegistry.set(sandboxId, sandbox);

  return {
    sandbox: {
      state: { type: "vercel" as const, sandboxId },
      workingDirectory:
        typeof sandbox.workingDirectory === "string"
          ? sandbox.workingDirectory
          : "/repo",
    },
    approval: {},
    model: "test-model",
  };
}

function executionOptions(experimental_context?: unknown) {
  return {
    toolCallId: "tool-call-1",
    messages: [],
    experimental_context,
  };
}

async function getNeedsApprovalResult<TArgs>(
  needsApproval: boolean | ToolNeedsApprovalFunction<TArgs> | undefined,
  args: TArgs,
  experimental_context: unknown,
) {
  if (typeof needsApproval === "function") {
    return await Promise.resolve(
      needsApproval(args, executionOptions(experimental_context)),
    );
  }
  return needsApproval ?? false;
}

async function createFsSandbox() {
  const workingDirectory = await mkdtemp(path.join(tmpdir(), "agent-tools-"));

  const sandbox = {
    workingDirectory,
    applyWorkspaceEdit: createLocalWorkspaceEditor(workingDirectory),
    searchWorkspace: createLocalWorkspaceSearcher(workingDirectory),
    stat: (filePath: string) => stat(filePath),
    readFile: (filePath: string, encoding: BufferEncoding) =>
      readFile(filePath, { encoding }),
    writeFile: (filePath: string, content: string, encoding: BufferEncoding) =>
      writeFile(filePath, content, { encoding }),
    mkdir: (dirPath: string, options: { recursive: boolean }) =>
      mkdir(dirPath, options),
  };

  return { sandbox, workingDirectory };
}

describe("tools execute behavior", () => {
  test("coordinated tools integrate revisions, compact results, patching and approved undo", async () => {
    const { sandbox, workingDirectory } = await createFsSandbox();
    await writeFile(path.join(workingDirectory, "a.ts"), "const old = 1;\n");
    const context = createContext(sandbox);
    const revision = createHash("sha256")
      .update("const old = 1;\n")
      .digest("hex");
    const input = {
      files: [
        {
          filePath: "a.ts",
          expectedRevision: revision,
          edits: [{ oldString: "old", newString: "value" }],
        },
      ],
    };
    const edited = workspaceEditOutputSchema.parse(
      await multiEditTool.execute?.(input, executionOptions(context)),
    );
    if (!edited.success) throw new Error(edited.error);
    expect(edited.changes[0]?.after).toBe("const value = 1;\n");
    expect(
      await multiEditTool.toModelOutput?.({
        toolCallId: "tool-call-1",
        input,
        output: edited,
      }),
    ).toEqual({
      type: "json",
      value: {
        ...edited,
        changes: [
          {
            path: "a.ts",
            beforeRevision: revision,
            afterRevision: edited.changes[0]?.afterRevision,
          },
        ],
      },
    });
    const patched = workspaceEditOutputSchema.parse(
      await applyPatchTool.execute?.(
        {
          patch:
            "*** Begin Patch\n*** Update File: a.ts\n@@\n-const value = 1;\n+const value = 2;\n*** Add File: b.ts\n+export {};\n*** End Patch",
          expectedRevisions: { "a.ts": edited.changes[0]?.afterRevision ?? "" },
        },
        { ...executionOptions(context), toolCallId: "patch" },
      ),
    );
    if (!patched.success) throw new Error(patched.error);
    expect(await readFile(path.join(workingDirectory, "a.ts"), "utf8")).toBe(
      "const value = 2;\n",
    );
    expect(
      await getNeedsApprovalResult(
        undoEditTool.needsApproval,
        { changeSetId: patched.changeSetId },
        context,
      ),
    ).toBe(true);
    expect(
      await getNeedsApprovalResult(
        undoEditTool.needsApproval,
        { changeSetId: patched.changeSetId, dryRun: true },
        context,
      ),
    ).toBe(false);
    const undone = workspaceEditOutputSchema.parse(
      await undoEditTool.execute?.(
        { changeSetId: patched.changeSetId },
        { ...executionOptions(context), toolCallId: "undo" },
      ),
    );
    expect(undone.success).toBe(true);
    expect(await readFile(path.join(workingDirectory, "a.ts"), "utf8")).toBe(
      "const value = 1;\n",
    );
    expect(
      await stat(path.join(workingDirectory, "b.ts")).catch(() => null),
    ).toBeNull();
  });

  test("readFileTool returns numbered lines for offset/limit", async () => {
    const { sandbox, workingDirectory } = await createFsSandbox();
    const filePath = path.join(workingDirectory, "notes.txt");
    await writeFile(filePath, "line-1\nline-2\nline-3", "utf-8");

    const result = await readFileTool().execute?.(
      { filePath, offset: 2, limit: 2 },
      executionOptions(createContext(sandbox)),
    );

    expect(result).toEqual({
      success: true,
      path: "notes.txt",
      revision: createHash("sha256")
        .update("line-1\nline-2\nline-3")
        .digest("hex"),
      totalLines: 3,
      startLine: 2,
      endLine: 3,
      content: "2: line-2\n3: line-3",
      columnOffset: 0,
      clipped: false,
    });
  });

  test("readFileTool rejects reading directories", async () => {
    const { sandbox, workingDirectory } = await createFsSandbox();

    const result = await readFileTool().execute?.(
      { filePath: workingDirectory },
      executionOptions(createContext(sandbox)),
    );

    expect(result).toEqual({
      success: false,
      error: "Cannot read a directory. Use glob or ls command instead.",
    });
  });

  test("readFileTool requires approval for dotenv files", async () => {
    const baseContext = {
      sandbox: { workingDirectory: "/repo" },
      model: "test-model",
    };

    const dotenvApproval = await getNeedsApprovalResult(
      readFileTool().needsApproval,
      { filePath: ".env.local" },
      baseContext,
    );
    expect(dotenvApproval).toBe(true);

    const nestedDotenvApproval = await getNeedsApprovalResult(
      readFileTool().needsApproval,
      { filePath: "apps/web/.env.example" },
      baseContext,
    );
    expect(nestedDotenvApproval).toBe(true);

    const regularFileApproval = await getNeedsApprovalResult(
      readFileTool().needsApproval,
      { filePath: "README.md" },
      baseContext,
    );
    expect(regularFileApproval).toBe(false);
  });

  test("writeFileTool creates parent directories and writes content", async () => {
    const { sandbox, workingDirectory } = await createFsSandbox();
    const relativePath = "nested/output.txt";

    const result = await writeFileTool().execute?.(
      { filePath: relativePath, content: "hello" },
      executionOptions(createContext(sandbox)),
    );

    const expectedPath = path.join(workingDirectory, relativePath);
    const written = await readFile(expectedPath, "utf-8");

    expect(written).toBe("hello");
    expect(result).toEqual({
      success: true,
      path: relativePath,
      bytesWritten: 5,
      changeSetId: expect.any(String),
    });
  });

  test("editFileTool rejects ambiguous replacement unless replaceAll is true", async () => {
    const { sandbox, workingDirectory } = await createFsSandbox();
    const filePath = path.join(workingDirectory, "src.txt");
    await writeFile(filePath, "alpha\nalpha\nomega", "utf-8");

    const result = await editFileTool().execute?.(
      { filePath, oldString: "alpha", newString: "beta" },
      executionOptions(createContext(sandbox)),
    );

    expect(result).toEqual({
      success: false,
      error:
        "oldString found 2 times. Use replaceAll=true or provide more context to make it unique.",
    });
  });

  test("editFileTool replaces all matches and reports first start line", async () => {
    const { sandbox, workingDirectory } = await createFsSandbox();
    const filePath = path.join(workingDirectory, "src.txt");
    await writeFile(filePath, "alpha\nalpha\nomega", "utf-8");

    const result = await editFileTool().execute?.(
      { filePath, oldString: "alpha", newString: "beta", replaceAll: true },
      executionOptions(createContext(sandbox)),
    );

    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("beta\nbeta\nomega");
    expect(result).toEqual({
      success: true,
      path: "src.txt",
      replacements: 2,
      changeSetId: expect.any(String),
      startLine: 1,
    });
  });

  test("grepTool pages stored matches through cursors with compatible fields", async () => {
    const { sandbox, workingDirectory } = await createFsSandbox();
    await mkdir(path.join(workingDirectory, "src"));
    await writeFile(
      path.join(workingDirectory, "src", "a.ts"),
      Array.from({ length: 150 }, (_, line) => `call(${line}) ok`).join("\n"),
    );
    await writeFile(path.join(workingDirectory, "src", "b.js"), "call(1)\n");
    const context = createContext(sandbox);
    const first = await grepTool().execute?.(
      { pattern: "call(", mode: "literal", path: "src", glob: "*.ts" },
      executionOptions(context),
    );
    // Capture before asserting: Bun's toMatchObject writes matchers into the received object.
    const cursor = (first as { nextCursor: string }).nextCursor;
    expect(first).toMatchObject({
      success: true,
      pattern: "call(",
      mode: "literal",
      path: "src",
      matchCount: 150,
      filesWithMatches: 1,
      returned: 100,
      complete: true,
      nextCursor: expect.stringMatching(/^s1\./),
    });
    const matches = (first as { matches: unknown[] }).matches;
    expect(matches[0]).toEqual({
      file: "src/a.ts",
      line: 1,
      column: 1,
      content: "call(0) ok",
    });
    const second = await grepTool().execute?.(
      { cursor },
      executionOptions(context),
    );
    expect(second).toMatchObject({ returned: 50, matchCount: 150 });
    expect(second).not.toHaveProperty("nextCursor");
    expect(
      (second as { matches: { line: number }[] }).matches.map((m) => m.line),
    ).toEqual(Array.from({ length: 50 }, (_, index) => index + 101));

    expect(
      await grepTool().execute?.(
        { pattern: "call", output: "count", path: workingDirectory },
        executionOptions(context),
      ),
    ).toMatchObject({
      counts: [
        { file: "src/a.ts", count: 150 },
        { file: "src/b.js", count: 1 },
      ],
    });
    expect(
      await grepTool().execute?.(
        { pattern: "x", path: "../outside" },
        executionOptions(context),
      ),
    ).toEqual({
      success: false,
      error: "Path must stay within the workspace.",
    });
    expect(
      await globTool().execute?.({ cursor }, executionOptions(context)),
    ).toMatchObject({ success: false, error: expect.stringContaining("grep") });
    expect(
      await grepTool().execute?.(
        { cursor: "bogus" },
        executionOptions(context),
      ),
    ).toMatchObject({
      success: false,
      error: expect.stringContaining("cursor"),
    });
  });

  test("globTool matches full relative paths and pages file metadata", async () => {
    const { sandbox, workingDirectory } = await createFsSandbox();
    await mkdir(path.join(workingDirectory, "src", "deep"), {
      recursive: true,
    });
    await writeFile(path.join(workingDirectory, "top.ts"), "1");
    await writeFile(path.join(workingDirectory, "src", "a.ts"), "12");
    await writeFile(path.join(workingDirectory, "src", "deep", "b.ts"), "123");
    const context = createContext(sandbox);
    expect(
      await globTool().execute?.(
        { pattern: "*.ts" },
        executionOptions(context),
      ),
    ).toMatchObject({ count: 1, totalFiles: 1, files: [{ path: "top.ts" }] });
    const first = await globTool().execute?.(
      { pattern: "src/**/*.ts", path: ".", sort: "path", limit: 1 },
      executionOptions(context),
    );
    const cursor = (first as { nextCursor: string }).nextCursor;
    expect(first).toMatchObject({
      success: true,
      pattern: "src/**/*.ts",
      baseDir: ".",
      count: 1,
      totalFiles: 2,
      files: [{ path: "src/a.ts", size: 2, modifiedAt: expect.any(String) }],
      nextCursor: expect.any(String),
    });
    expect(
      await globTool().execute?.({ cursor }, executionOptions(context)),
    ).toMatchObject({ count: 1, files: [{ path: "src/deep/b.ts", size: 3 }] });
  });

  test("runChecksTool runs default checks, rejects unknown ones and gates arbitrary scripts", async () => {
    const workingDirectory = await mkdtemp(
      path.join(tmpdir(), "agent-checks-"),
    );
    await writeFile(
      path.join(workingDirectory, "package.json"),
      JSON.stringify({
        packageManager: "npm@10.0.0",
        scripts: { typecheck: "exit 0", deploy: "exit 0" },
      }),
    );
    const sandbox = createLocalCheckSandbox(
      workingDirectory,
      path.join(workingDirectory, ".state"),
    ) as unknown as Record<string, unknown>;
    const context = createContext(sandbox);
    const tool = runChecksTool();
    expect(
      await getNeedsApprovalResult(
        tool.needsApproval,
        { checks: ["typecheck"] },
        context,
      ),
    ).toBe(false);
    expect(
      await getNeedsApprovalResult(
        tool.needsApproval,
        { checks: ["deploy"] },
        context,
      ),
    ).toBe(true);
    expect(await tool.execute?.({}, executionOptions(context))).toMatchObject({
      success: true,
      passed: false,
      revision: null,
      checks: [{ id: "typecheck", status: "passed", exitCode: 0 }],
    });
    expect(
      await tool.execute?.({ checks: ["nope"] }, executionOptions(context)),
    ).toMatchObject({
      success: false,
      error: expect.stringContaining("Available: typecheck"),
    });
    expect(
      await tool.execute?.({ path: "../elsewhere" }, executionOptions(context)),
    ).toEqual({
      success: false,
      error: "Path must stay within the workspace.",
    });
  });

  test("bashTool handles detached and non-detached execution", async () => {
    const noDetachSandbox = {
      workingDirectory: "/repo",
      exec: async () => ({
        success: true,
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        truncated: true,
      }),
    };

    const detachedUnsupported = await bashTool().execute?.(
      { command: "npm run dev", detached: true },
      executionOptions(createContext(noDetachSandbox)),
    );

    expect(detachedUnsupported).toMatchObject({
      success: false,
      exitCode: null,
      stdout: "",
      stderr: expect.stringContaining("host did not supply a chat/task scope"),
    });

    const normalResult = await bashTool().execute?.(
      { command: "ls" },
      executionOptions(createContext(noDetachSandbox)),
    );

    expect(normalResult).toEqual({
      success: true,
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      truncated: true,
    });
  });

  test("commandNeedsApproval flags curl, rm -rf, and dotenv commands", () => {
    expect(commandNeedsApproval("ls -la")).toBe(false);
    expect(commandNeedsApproval("git status --short")).toBe(false);
    expect(commandNeedsApproval("npm install")).toBe(false);
    expect(commandNeedsApproval("bun install")).toBe(false);
    expect(commandNeedsApproval("custom-command --help")).toBe(false);
    expect(commandNeedsApproval("git reset --hard HEAD~1")).toBe(false);
    expect(commandNeedsApproval("curl -s https://example.com")).toBe(true);
    expect(commandNeedsApproval("bash -c 'curl https://example.com'")).toBe(
      true,
    );
    expect(commandNeedsApproval("rm -fr tmp")).toBe(true);
    expect(commandNeedsApproval("rm -r -f tmp")).toBe(true);
    expect(commandNeedsApproval("find . -delete")).toBe(true);
    expect(commandNeedsApproval("rm -rf tmp")).toBe(true);
    expect(commandNeedsApproval("cat .env.local")).toBe(true);
    expect(commandNeedsApproval("cat .e''nv.local")).toBe(true);
    expect(commandNeedsApproval("cat .e$(printf nv).local")).toBe(true);
    expect(commandNeedsApproval("grep API_KEY apps/web/.env.example")).toBe(
      true,
    );
  });

  test("bashTool needsApproval blocks dangerous and dotenv commands by default", async () => {
    const baseContext = {
      sandbox: { workingDirectory: "/repo" },
      model: "test-model",
    };

    const safeCommand = await getNeedsApprovalResult(
      bashTool().needsApproval,
      { command: "ls -la" },
      {
        ...baseContext,
      },
    );
    expect(safeCommand).toBe(false);

    const dangerousCommand = await getNeedsApprovalResult(
      bashTool().needsApproval,
      { command: "rm -rf tmp" },
      {
        ...baseContext,
      },
    );
    expect(dangerousCommand).toBe(true);

    const dotenvCommand = await getNeedsApprovalResult(
      bashTool().needsApproval,
      { command: "cat .env.local" },
      {
        ...baseContext,
      },
    );
    expect(dotenvCommand).toBe(true);

    const allowedBuildCommand = await getNeedsApprovalResult(
      bashTool().needsApproval,
      { command: "bun run ci" },
      {
        ...baseContext,
      },
    );
    expect(allowedBuildCommand).toBe(false);
  });

  afterEach(() => {
    sandboxRegistry.clear();
  });

  test("webFetchTool treats curl exit 23 as a truncated success", async () => {
    let executedCommand = "";
    const responseBody = "x".repeat(MAX_BODY_LENGTH);

    const sandbox = {
      workingDirectory: "/repo",
      exec: async (command: string) => {
        executedCommand = command;

        if (command.startsWith("getent ahosts")) {
          return {
            success: true,
            exitCode: 0,
            stdout: "93.184.216.34\n",
            stderr: "",
            truncated: false,
          };
        }

        return {
          success: false,
          exitCode: 23,
          stdout: `${responseBody}\n200`,
          stderr: "",
          truncated: false,
        };
      },
    };

    const context = createContext(sandbox);

    const result = await webFetchTool.execute?.(
      {
        url: "https://example.com",
        method: "GET",
      },
      executionOptions(context),
    );

    expect(executedCommand).toContain("curl");
    expect(executedCommand).toContain(`head -c ${MAX_BODY_LENGTH}`);
    expect(result).toMatchObject({
      success: true,
      status: 200,
      truncated: true,
    });

    const body =
      result && typeof result === "object" && "body" in result
        ? (result.body as string)
        : "";
    expect(body.length).toBe(MAX_BODY_LENGTH);
  });

  test("webFetchTool requires approval", async () => {
    const needsApproval = await getNeedsApprovalResult(
      webFetchTool.needsApproval,
      { url: "https://example.com", method: "GET" },
      {
        sandbox: { workingDirectory: "/repo" },
        model: "test-model",
      },
    );

    expect(needsApproval).toBe(true);
  });

  test("webFetchTool rejects public hostnames that resolve to private addresses", async () => {
    const sandbox = {
      workingDirectory: "/repo",
      exec: async (command: string) => {
        if (command.startsWith("getent ahosts")) {
          return {
            success: true,
            exitCode: 0,
            stdout: "127.0.0.1\n",
            stderr: "",
            truncated: false,
          };
        }

        throw new Error("curl should not run for private DNS results");
      },
    };

    const result = await webFetchTool.execute?.(
      {
        url: "https://internal.example",
        method: "GET",
      },
      executionOptions(createContext(sandbox)),
    );

    expect(result).toEqual({
      success: false,
      error: "Fetch failed: URL resolves to a private or internal host",
    });
  });

  test("webFetchTool rejects when DNS resolution fails", async () => {
    const sandbox = {
      workingDirectory: "/repo",
      exec: async (command: string) => {
        if (command.startsWith("getent ahosts")) {
          return {
            success: false,
            exitCode: 2,
            stdout: "",
            stderr: "resolution failed",
            truncated: false,
          };
        }

        throw new Error("curl should not run when DNS validation fails");
      },
    };

    const result = await webFetchTool.execute?.(
      {
        url: "https://unresolved.example",
        method: "GET",
      },
      executionOptions(createContext(sandbox)),
    );

    expect(result).toEqual({
      success: false,
      error: "Fetch failed: URL resolves to a private or internal host",
    });
  });

  test("webFetchTool rejects private and internal URL hosts", () => {
    const blockedUrls = [
      "http://localhost",
      "http://127.0.0.1",
      "http://10.0.0.1",
      "http://172.16.0.1",
      "http://192.168.0.1",
      "http://169.254.169.254",
      "http://0.0.0.0",
      "http://[::]",
      "http://[::1]",
      "http://[fc00::1]",
      "http://[fe80::1]",
      "http://[::ffff:127.0.0.1]",
      "http://[::ffff:0a00:0001]",
      "http://[::ffff:c0a8:0001]",
      "http://[::ffff:ac10:0001]",
    ];

    for (const url of blockedUrls) {
      expect(isAllowedWebUrl(url)).toBe(false);
    }
  });

  test("webFetchTool allows public http and https URL hosts", () => {
    const allowedUrls = [
      "https://example.com",
      "http://93.184.216.34",
      "https://[2606:2800:220:1:248:1893:25c8:1946]",
      "https://[::ffff:5db8:d822]",
    ];

    for (const url of allowedUrls) {
      expect(isAllowedWebUrl(url)).toBe(true);
    }
  });

  test("askUserQuestionTool formats structured answers", () => {
    const answerOutput = askUserQuestionTool.toModelOutput?.({
      toolCallId: "tool-call-1",
      input: { questions: [] },
      output: {
        answers: {
          "Which package manager?": "bun",
          "Which checks?": ["typecheck", "test"],
        },
      },
    });

    expect(answerOutput).toEqual({
      type: "text",
      value:
        'User has answered your questions: "Which package manager?"="bun", "Which checks?"="typecheck, test". You can now continue with the user\'s answers in mind.',
    });

    const declinedOutput = askUserQuestionTool.toModelOutput?.({
      toolCallId: "tool-call-1",
      input: { questions: [] },
      output: { declined: true },
    });

    expect(declinedOutput).toEqual({
      type: "text",
      value:
        "User declined to answer questions. You should continue without this information or ask in a different way.",
    });
  });

  test("skillTool loads skill content and substitutes arguments", async () => {
    const sandbox = {
      workingDirectory: "/repo",
      readFile: async () =>
        "---\nname: review\ndescription: review code\n---\nRun review with $ARGUMENTS",
    };

    const result = await skillTool.execute?.(
      { skill: "Review", args: "--quick" },
      executionOptions({
        ...createContext(sandbox),
        skills: [
          {
            name: "review",
            description: "Review code changes",
            path: "/repo/.skills/review",
            filename: "SKILL.md",
            options: {},
          },
        ],
      }),
    );

    expect(result).toEqual({
      success: true,
      skillName: "Review",
      skillPath: "/repo/.skills/review",
      content:
        "Skill directory: /repo/.skills/review\n\nRun review with --quick",
    });
  });

  test("skillTool returns helpful errors for missing or disabled skills", async () => {
    const sandbox = {
      workingDirectory: "/repo",
      readFile: async () => "skill-body",
    };

    const missingResult = await skillTool.execute?.(
      { skill: "unknown" },
      executionOptions({ ...createContext(sandbox), skills: [] }),
    );

    expect(missingResult).toEqual({
      success: false,
      error: "Skill 'unknown' not found. Available skills: none",
    });

    const disabledResult = await skillTool.execute?.(
      { skill: "commit" },
      executionOptions({
        ...createContext(sandbox),
        skills: [
          {
            name: "commit",
            description: "Create a commit",
            path: "/repo/.skills/commit",
            filename: "SKILL.md",
            options: { disableModelInvocation: true },
          },
        ],
      }),
    );

    expect(disabledResult).toEqual({
      success: false,
      error:
        "Skill 'commit' cannot be invoked by the model (disable-model-invocation is set)",
    });
  });

  test("taskTool exposes both subagent types without approval gates", async () => {
    const explorerNeedsApproval = await getNeedsApprovalResult(
      taskTool.needsApproval,
      {
        subagentType: "explorer",
        task: "Find usages",
        instructions: "Search for helper usage",
      },
      {
        sandbox: { workingDirectory: "/repo" },
        model: "test-model",
        approval: {},
      },
    );
    expect(explorerNeedsApproval).toBe(false);

    const executorNeedsApproval = await getNeedsApprovalResult(
      taskTool.needsApproval,
      {
        subagentType: "executor",
        task: "Apply changes",
        instructions: "Update files",
      },
      {
        sandbox: { workingDirectory: "/repo" },
        model: "test-model",
        approval: {},
      },
    );
    expect(executorNeedsApproval).toBe(false);
  });

  test("taskTool description lists subagents from the shared registry", () => {
    expect(taskTool.description).toContain(
      "`explorer` - Use for read-only codebase exploration, tracing behavior, and answering questions without changing files",
    );
    expect(taskTool.description).toContain(
      "`executor` - Use for well-scoped implementation work, including edits, scaffolding, refactors, and other file changes",
    );
    expect(taskTool.description).toContain("up to 100 tool steps");
  });

  test("buildSystemPrompt lists subagents from the shared registry", () => {
    const prompt = buildSystemPrompt({});

    expect(prompt).toContain("Available subagents:");
    expect(prompt).toContain(
      "`explorer` - Use for read-only codebase exploration, tracing behavior, and answering questions without changing files",
    );
    expect(prompt).toContain(
      "`executor` - Use for well-scoped implementation work, including edits, scaffolding, refactors, and other file changes",
    );
  });

  test("todoWriteTool returns updated todo list metadata", async () => {
    const todos = [
      { id: "1", content: "Write tests", status: "in_progress" as const },
      { id: "2", content: "Run checks", status: "pending" as const },
    ];

    const result = await todoWriteTool.execute?.({ todos }, executionOptions());

    expect(result).toEqual({
      success: true,
      message: "Updated task list with 2 items",
      todos,
    });
  });
});
