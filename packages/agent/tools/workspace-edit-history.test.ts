import { expect, test } from "bun:test";
import type { ModelMessage } from "ai";
import { createWorkspaceEditHistory } from "./workspace-edit-history";

test("subagent transcript restores full diffs without modifying compact model messages", () => {
  const history = createWorkspaceEditHistory();
  const output = {
    success: true,
    changeSetId: "a".repeat(64),
    dryRun: false,
    replacements: 1,
    changes: [
      {
        path: "a",
        before: "old",
        after: "new",
        beforeRevision: "b",
        afterRevision: "c",
      },
    ],
  };
  history.capture({ toolName: "multi_edit", toolCallId: "edit", output });
  const messages: ModelMessage[] = [
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "edit",
          toolName: "multi_edit",
          output: {
            type: "json",
            value: { success: true, changeSetId: "a".repeat(64) },
          },
        },
      ],
    },
  ];
  const original = JSON.stringify(messages);
  expect(JSON.stringify(history.restore(messages))).toContain('"before":"old"');
  expect(JSON.stringify(history.restore(messages))).toContain('"after":"new"');
  expect(JSON.stringify(messages)).toBe(original);
});
