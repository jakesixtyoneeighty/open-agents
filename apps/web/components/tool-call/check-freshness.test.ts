import { expect, test } from "bun:test";
import type { WebAgentUIMessage } from "@/app/types";
import { computeCheckFreshness } from "./check-freshness";

const checks = (id: string) => ({
  type: "tool-run_checks",
  toolCallId: id,
  state: "output-available",
  input: {},
  output: { success: true, passed: true, checks: [] },
});

test("later edits make earlier check results stale; shell commands make them possibly stale", () => {
  const messages = [
    { id: "1", role: "assistant", parts: [checks("first")] },
    {
      id: "2",
      role: "assistant",
      parts: [
        {
          type: "tool-multi_edit",
          toolCallId: "edit",
          state: "output-available",
          input: { files: [] },
          output: { success: true, dryRun: false, changes: [] },
        },
        checks("second"),
        {
          type: "tool-bash",
          toolCallId: "bash",
          state: "output-available",
          input: { command: "git status" },
          output: { success: true, exitCode: 0, stdout: "", stderr: "" },
        },
        checks("third"),
        {
          type: "tool-multi_edit",
          toolCallId: "dry",
          state: "output-available",
          input: { files: [] },
          output: { success: true, dryRun: true, changes: [] },
        },
      ],
    },
  ] as unknown as WebAgentUIMessage[];
  const freshness = computeCheckFreshness(messages);
  expect(freshness.get("first")).toBe("stale");
  expect(freshness.get("second")).toBe("maybe_stale");
  expect(freshness.get("third")).toBe("current");
});
