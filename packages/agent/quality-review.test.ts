import { expect, test } from "bun:test";
import { tool } from "ai";
import { z } from "zod";
import { getQualityReviewTools } from "./quality-review";

test("quality passes allow source inspection and screenshots without project mutation tools", () => {
  const stub = tool({ inputSchema: z.object({}), execute: async () => "ok" });
  const all = {
    read: stub,
    glob: stub,
    grep: stub,
    screenshot: stub,
    ask_user_question: stub,
    write: stub,
    edit: stub,
    bash: stub,
    task: stub,
    skill: stub,
    github_create_pr: stub,
    unknown_host_tool: stub,
  };
  expect(Object.keys(getQualityReviewTools(all)).sort()).toEqual([
    "ask_user_question",
    "glob",
    "grep",
    "read",
    "screenshot",
  ]);
  expect(all.edit).toBe(stub);
});
