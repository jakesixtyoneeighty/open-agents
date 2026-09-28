import { expect, test } from "bun:test";
import { measureEfficiency } from "@open-agents/agent";
import type { WebAgentUIMessage } from "@/app/types";
import { buildTokenEfficiencyReport } from "./token-efficiency";

test("reports parent plus child usage once, without leaking content or double-counting time", () => {
  const measurement = {
    ...measureEfficiency(undefined, 0.01, 100),
    inputTokens: 100,
    outputTokens: 20,
  };
  const message = {
    id: "private-message-id",
    role: "assistant",
    metadata: { efficiency: measurement },
    parts: [
      { type: "text", text: "private-output" },
      {
        type: "tool-task",
        toolCallId: "child",
        state: "output-available",
        input: {
          task: "private-task",
          instructions: "private-instructions",
          subagentType: "executor",
        },
        output: { efficiency: measurement, final: [], modelId: "test-model" },
      },
    ],
  } as WebAgentUIMessage;
  const report = buildTokenEfficiencyReport([message]);
  expect(report.turns[0]?.combined).toMatchObject({
    steps: 2,
    inputTokens: 200,
    outputTokens: 40,
    costUsd: 0.02,
    durationMs: null,
  });
  expect(report.turns[0]?.main?.durationMs).toBe(100);
  expect(JSON.stringify(report)).not.toContain("private-");
});

test("legacy and unfinished child measurements are unknown rather than zero", () => {
  const message = {
    id: "a",
    role: "assistant",
    metadata: { efficiency: measureEfficiency(undefined) },
    parts: [
      { type: "tool-task", toolCallId: "pending", state: "input-streaming" },
    ],
  } as WebAgentUIMessage;
  expect(buildTokenEfficiencyReport([message]).turns[0]?.combined).toBeNull();
  expect(
    buildTokenEfficiencyReport([{ id: "legacy", role: "assistant", parts: [] }])
      .turns[0]?.main,
  ).toBeNull();
});
