import { expect, test } from "bun:test";
import { openAgent } from "./open-agent";
import { getPlanningTools } from "./planning";
import { getQualityReviewTools } from "./quality-review";
import { explorerSubagent } from "./subagents/explorer";
import { executorSubagent } from "./subagents/executor";
import { designSubagent } from "./subagents/design";

test("the actual agent registries expose coordinated editing only to build roles", () => {
  for (const agent of [openAgent, executorSubagent, designSubagent]) {
    for (const name of ["multi_edit", "apply_patch", "undo_edit"])
      expect(agent.tools).toHaveProperty(name);
  }
  for (const tools of [
    explorerSubagent.tools,
    getPlanningTools(openAgent.tools),
    getQualityReviewTools(openAgent.tools),
  ]) {
    for (const name of [
      "bash",
      "write",
      "edit",
      "multi_edit",
      "apply_patch",
      "undo_edit",
    ])
      expect(tools).not.toHaveProperty(name);
  }
});

test("quality review can access the real registered screenshot implementation", () => {
  expect(getQualityReviewTools(openAgent.tools).screenshot).toBe(
    designSubagent.tools.screenshot,
  );
  expect(getPlanningTools(openAgent.tools)).not.toHaveProperty("screenshot");
});
