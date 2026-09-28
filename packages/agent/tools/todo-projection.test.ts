import { expect, test } from "bun:test";
import { convertToModelMessages, generateText, stepCountIs } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { todoWriteTool } from "./todo";

const todos = [
  {
    id: "1",
    content: "Preserve this requirement",
    status: "in_progress" as const,
  },
];
const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

test("SDK live tool loop sees acknowledgement while complete result stays available", async () => {
  let calls = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async () =>
      ++calls === 1
        ? {
            content: [
              {
                type: "tool-call",
                toolCallId: "todo-1",
                toolName: "todo_write",
                input: JSON.stringify({ todos }),
              },
            ],
            finishReason: { unified: "tool-calls", raw: undefined },
            usage,
            warnings: [],
          }
        : {
            content: [{ type: "text", text: "done" }],
            finishReason: { unified: "stop", raw: undefined },
            usage,
            warnings: [],
          },
  });
  const result = await generateText({
    model,
    tools: { todo_write: todoWriteTool },
    prompt: "Track the work",
    stopWhen: stepCountIs(2),
  });
  expect(result.steps[0]?.toolResults[0]?.output).toEqual({
    success: true,
    message: "Updated task list with 1 items",
    todos,
  });
  const prompt = model.doGenerateCalls[1]!.prompt;
  expect(
    JSON.stringify(prompt).match(/Preserve this requirement/g),
  ).toHaveLength(1);
  expect(prompt.find((message) => message.role === "tool")).toMatchObject({
    content: [
      { output: { type: "text", value: "Updated task list with 1 items" } },
    ],
  });
});

test("rehydrated UI history uses the same compact projection without losing the UI list", async () => {
  const output = {
    success: true,
    message: "Updated task list with 1 items",
    todos,
  };
  const ui = [
    {
      id: "assistant",
      role: "assistant" as const,
      parts: [
        {
          type: "tool-todo_write" as const,
          toolCallId: "todo-1",
          state: "output-available" as const,
          input: { todos },
          output,
        },
      ],
    },
  ];
  const messages = await convertToModelMessages(ui, {
    tools: { todo_write: todoWriteTool },
  });
  expect(
    JSON.stringify(messages).match(/Preserve this requirement/g),
  ).toHaveLength(1);
  expect(ui[0]!.parts[0]!.output.todos).toEqual(todos);
});
