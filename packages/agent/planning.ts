import type { ToolSet } from "ai";

// Fail closed: new host tools are not automatically available while planning.
const PLANNING_TOOLS = new Set([
  "read",
  "glob",
  "grep",
  "todo_write",
  "ask_user_question",
  "web_fetch",
  "web_search",
]);

export function getPlanningTools<T extends ToolSet>(tools: T): T {
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => PLANNING_TOOLS.has(name)),
  ) as T;
}
