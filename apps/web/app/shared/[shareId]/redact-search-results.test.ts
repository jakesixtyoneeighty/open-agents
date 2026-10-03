import { expect, test } from "bun:test";
import type { WebAgentUIMessage } from "@/app/types";
import { redactSharedEnvContent } from "./redact-shared-env-content";

test("shared transcripts redact legacy grep matches from dotenv files, including nested tasks", () => {
  const legacyOutput = {
    success: true,
    pattern: "TOKEN",
    matchCount: 2,
    filesWithMatches: 2,
    matches: [
      { file: ".env.local", line: 1, content: "TOKEN=secret-example" },
      { file: "src/a.ts", line: 3, content: "read TOKEN" },
    ],
  };
  const message = {
    id: "test",
    role: "assistant",
    parts: [
      {
        type: "tool-grep",
        toolCallId: "grep",
        state: "output-available",
        input: { pattern: "TOKEN", path: ".env.local" },
        output: legacyOutput,
      },
      {
        type: "tool-task",
        toolCallId: "child",
        state: "output-available",
        input: { subagentType: "explorer", task: "test", instructions: "test" },
        output: {
          final: [
            {
              role: "assistant",
              content: [
                {
                  type: "tool-call",
                  toolCallId: "nested-grep",
                  toolName: "grep",
                  input: { pattern: "TOKEN" },
                },
              ],
            },
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolCallId: "nested-grep",
                  toolName: "grep",
                  output: { type: "json", value: legacyOutput },
                },
              ],
            },
          ],
        },
      },
    ],
  } as WebAgentUIMessage;
  const serialized = JSON.stringify(redactSharedEnvContent(message));
  expect(serialized).not.toContain("secret-example");
  expect(serialized).toContain("read TOKEN");
  expect(serialized).toContain(".env.local");
});
