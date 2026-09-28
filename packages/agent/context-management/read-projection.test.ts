import { expect, test } from "bun:test";
import type { ModelMessage, JSONValue } from "ai";
import { projectReadMessages } from "./read-projection";

const body = "1: function verifiedEvidence() {}\n".repeat(100);
function read(
  id: string,
  overrides: Record<string, JSONValue> = {},
): ModelMessage {
  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolName: "read",
        toolCallId: id,
        output: {
          type: "json",
          value: {
            success: true,
            path: "file.ts",
            startLine: 1,
            endLine: 100,
            content: body,
            clipped: false,
            columnOffset: 0,
            readIdentity: { path: "/repo/file.ts", revision: "a".repeat(64) },
            ...overrides,
          },
        },
      },
    ],
  };
}

test("keeps the first evidence, projects later duplicates without mutating history", () => {
  const history = [read("first"), read("second")];
  const snapshot = structuredClone(history);
  const projected = projectReadMessages(history);
  expect(history).toEqual(snapshot);
  expect(JSON.stringify(projected[0])).toContain(body.split("\n")[0]!);
  expect(JSON.stringify(projected[1])).toContain("see read result first");
  expect(JSON.stringify(projected)).not.toContain("readIdentity");
  expect(JSON.stringify(projected).length).toBeLessThan(
    JSON.stringify(history).length / 1.5,
  );
  expect(projectReadMessages(projected)).toEqual(projected);
  expect(projectReadMessages([...history, read("third")]).slice(0, 2)).toEqual(
    projected,
  );
});

test("retains changed revisions, paths, content, ranges, clipped and failed reads", () => {
  const cases: Array<Record<string, JSONValue>> = [
    { readIdentity: { path: "/repo/file.ts", revision: "b".repeat(64) } },
    { readIdentity: { path: "/other/file.ts", revision: "a".repeat(64) } },
    { content: body + "changed" },
    { startLine: 2 },
    { endLine: 99 },
    { clipped: true },
    { columnOffset: 10 },
    { success: false },
    { readIdentity: null },
  ];
  for (const overrides of cases) {
    const projected = projectReadMessages([
      read("first"),
      read("second", overrides),
    ]);
    expect(JSON.stringify(projected[1])).not.toContain("see read result");
  }
});

test("does not deduplicate same-batch results, ambiguous IDs or tiny reads", () => {
  const first = read("first");
  const second = read("second");
  if (first.role !== "tool" || second.role !== "tool")
    throw new Error("fixture");
  expect(
    JSON.stringify(
      projectReadMessages([
        { role: "tool", content: [...first.content, ...second.content] },
      ]),
    ),
  ).not.toContain("see read result");
  expect(
    JSON.stringify(projectReadMessages([read("same"), read("same")])),
  ).not.toContain("see read result");
  expect(
    JSON.stringify(
      projectReadMessages([
        read("a", { content: "tiny" }),
        read("b", { content: "tiny" }),
      ]),
    ),
  ).not.toContain("see read result");
});

test("preserves reasoning, tool calls, failures and pending approvals byte-for-byte", () => {
  const messages: ModelMessage[] = [
    {
      role: "assistant",
      content: [
        {
          type: "reasoning",
          text: "reasoning",
          providerOptions: { openai: { encryptedContent: "opaque" } },
        },
        {
          type: "tool-call",
          toolName: "write",
          toolCallId: "pending",
          input: { filePath: "file.ts", content: "data" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolName: "read",
          toolCallId: "failed",
          output: { type: "error-text", value: "error" },
        },
      ],
    },
  ];
  expect(projectReadMessages(messages)).toEqual(messages);
});
