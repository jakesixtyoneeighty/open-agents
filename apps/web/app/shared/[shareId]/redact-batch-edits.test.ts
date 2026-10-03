import { expect, test } from "bun:test";
import type { WebAgentUIMessage } from "@/app/types";
import { redactSharedEnvContent } from "./redact-shared-env-content";

test("shared transcripts redact rejected patch and multi-edit payloads including nested tasks", () => {
  const message = {
    id: "test",
    role: "assistant",
    parts: [
      {
        type: "tool-apply_patch",
        toolCallId: "patch",
        state: "output-available",
        input: {
          patch:
            "*** Begin Patch\n*** Add File: .env\n+TOKEN=secret-example\n*** End Patch",
          expectedRevisions: {},
        },
        output: { success: false, error: "Sensitive path" },
      },
      {
        type: "tool-multi_edit",
        toolCallId: "multi",
        state: "output-available",
        input: {
          files: [
            {
              filePath: ".env",
              expectedRevision: "a".repeat(64),
              edits: [
                {
                  oldString: "secret-example",
                  newString: "new-secret-example",
                },
              ],
            },
          ],
        },
        output: { success: false, error: "Sensitive path" },
      },
      {
        type: "tool-task",
        toolCallId: "child",
        state: "output-available",
        input: { subagentType: "executor", task: "test", instructions: "test" },
        output: {
          final: [
            {
              role: "assistant",
              content: [
                {
                  type: "tool-call",
                  toolCallId: "nested-patch",
                  toolName: "apply_patch",
                  input: { patch: "secret-example", expectedRevisions: {} },
                },
              ],
            },
          ],
        },
      },
    ],
  } as WebAgentUIMessage;
  const output = redactSharedEnvContent(message);
  expect(JSON.stringify(output)).not.toContain("secret-example");
  expect(JSON.stringify(message)).toContain("secret-example");
});
