import type { ToolSet } from "ai";
import { getPlanningTools } from "./planning";

/** Project-read-only tools; screenshot setup writes only to browser runtime storage. */
export function getQualityReviewTools<T extends ToolSet>(tools: T): T {
  return {
    ...getPlanningTools(tools),
    ...(tools.browser_inspect
      ? { browser_inspect: tools.browser_inspect }
      : {}),
    ...(tools.screenshot ? { screenshot: tools.screenshot } : {}),
  } as T;
}
