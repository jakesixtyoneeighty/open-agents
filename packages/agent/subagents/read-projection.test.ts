import { expect, test } from "bun:test";
import type { ModelMessage } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { explorerSubagent } from "./explorer";
import { executorSubagent } from "./executor";
import { designSubagent } from "./design";

test("all child agents apply read projection at the SDK request boundary", async () => {
  const source = "1: original evidence\n".repeat(100);
  const messages: ModelMessage[] = [
    { role: "user", content: "Review the evidence" },
  ];
  for (const id of ["first", "second"]) {
    messages.push(
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: id,
            toolName: "read",
            input: { filePath: "file.ts" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: id,
            toolName: "read",
            output: {
              type: "json",
              value: {
                success: true,
                path: "file.ts",
                startLine: 1,
                endLine: 100,
                columnOffset: 0,
                clipped: false,
                content: source,
                readIdentity: {
                  path: "/repo/file.ts",
                  revision: "a".repeat(64),
                },
              },
            },
          },
        ],
      },
    );
  }
  for (const agent of [explorerSubagent, executorSubagent, designSubagent]) {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: "text", text: "reviewed" }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 5, text: 5, reasoning: 0 },
        },
        warnings: [],
      }),
    });
    await agent.generate({
      messages,
      options: {
        task: "review",
        instructions: "review",
        sandbox: {
          state: { type: "vercel", sandboxId: "test" },
          workingDirectory: "/repo",
        },
        model,
      },
    });
    const request = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(request).toContain("original evidence");
    expect(request).toContain("see read result first");
    expect(request).not.toContain("readIdentity");
    expect(JSON.stringify(messages)).toContain("readIdentity");
  }
});
