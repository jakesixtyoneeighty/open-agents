import { expect, test } from "bun:test";
import { openAgent } from "./open-agent";
import { getPlanningTools } from "./planning";
import { getQualityReviewTools } from "./quality-review";
import { explorerSubagent } from "./subagents/explorer";
import { executorSubagent } from "./subagents/executor";
import { designSubagent } from "./subagents/design";

test("the actual agent registries expose coordinated editing only to build roles", () => {
  for (const agent of [openAgent, executorSubagent, designSubagent]) {
    for (const name of [
      "multi_edit",
      "apply_patch",
      "undo_edit",
      "run_checks",
      "process",
    ])
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
      "run_checks",
      "process",
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

test("browser interactions are available only to build roles; review gets inspection", () => {
  for (const agent of [openAgent, executorSubagent, designSubagent]) {
    for (const name of ["browser_session", "browser_inspect", "browser_action"])
      expect(agent.tools).toHaveProperty(name);
  }
  expect(getQualityReviewTools(openAgent.tools).browser_inspect).toBe(
    openAgent.tools.browser_inspect,
  );
  for (const tools of [
    getQualityReviewTools(openAgent.tools),
    getPlanningTools(openAgent.tools),
    explorerSubagent.tools,
  ]) {
    expect(tools).not.toHaveProperty("browser_action");
    expect(tools).not.toHaveProperty("browser_session");
  }
  expect(getPlanningTools(openAgent.tools)).not.toHaveProperty(
    "browser_inspect",
  );
});
