import { expect, test } from "bun:test";
import { tool } from "ai";
import { z } from "zod";
import { getPlanningTools } from "./planning";

test("planning removes write, shell, delegation, skill and unknown host tools", () => {
  const stub = tool({ inputSchema: z.object({}), execute: async () => "ok" });
  const allTools = {
    read: stub,
    glob: stub,
    grep: stub,
    ask_user_question: stub,
    todo_write: stub,
    web_fetch: stub,
    web_search: stub,
    write: stub,
    edit: stub,
    bash: stub,
    task: stub,
    skill: stub,
    github_create_pr: stub,
    future_host_tool: stub,
  };
  const planningTools = getPlanningTools(allTools);
  expect(Object.keys(planningTools).sort()).toEqual([
    "ask_user_question",
    "glob",
    "grep",
    "read",
    "todo_write",
    "web_fetch",
    "web_search",
  ]);
  expect(allTools.write).toBe(stub);
  expect(planningTools.read).toBe(stub);
});
