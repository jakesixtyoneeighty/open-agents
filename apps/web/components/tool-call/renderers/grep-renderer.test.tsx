import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ToolRenderState } from "@open-agents/shared/lib/tool-state";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { GrepRenderer } from "./grep-renderer";

const state: ToolRenderState = {
  running: false,
  interrupted: false,
  denied: false,
  approvalRequested: false,
  isActiveApproval: false,
};

test("paged grep results show whole-search totals and continuation calls", () => {
  const part: ToolRendererProps<"tool-grep">["part"] = {
    type: "tool-grep",
    toolCallId: "page-2",
    state: "output-available",
    input: { cursor: `s1.${"a".repeat(64)}.100` },
    output: {
      success: true,
      pattern: "call",
      mode: "regex",
      output: "content",
      path: ".",
      matchCount: 150,
      filesWithMatches: 2,
      matches: [
        { file: "src/a.ts", line: 101, column: 1, content: "call(100)" },
      ],
      returned: 1,
      complete: false,
      incompleteReason: "time_limit",
      nextCursor: `s1.${"a".repeat(64)}.101`,
    },
  };
  const html = renderToStaticMarkup(<GrepRenderer part={part} state={state} />);
  expect(html).toContain("next page");
  expect(html).toContain("150 matches+ in 2 files+");
});
