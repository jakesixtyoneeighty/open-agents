import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ToolRenderState } from "@open-agents/shared/lib/tool-state";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { WorkspaceEditRenderer } from "./workspace-edit-renderer";

const state: ToolRenderState = {
  running: false,
  interrupted: false,
  denied: false,
  approvalRequested: false,
  isActiveApproval: false,
};
const part: ToolRendererProps<"tool-multi_edit">["part"] = {
  type: "tool-multi_edit",
  toolCallId: "test",
  state: "output-available",
  input: { files: [] },
  output: {
    success: true,
    changeSetId: "a".repeat(64),
    dryRun: true,
    replacements: 1,
    changes: [
      {
        path: "one.ts",
        before: "old",
        after: "new",
        beforeRevision: "a",
        afterRevision: "b",
      },
      {
        path: "two.ts",
        before: null,
        after: "new",
        beforeRevision: null,
        afterRevision: "c",
      },
    ],
  },
};

test("dry-run output shows a preview and file count without claiming application", () => {
  const html = renderToStaticMarkup(
    <WorkspaceEditRenderer part={part} state={state} />,
  );
  expect(html).toContain("Preview only");
  expect(html).toContain("2 files");
  expect(html).not.toContain(">Applied<");
});

test("partial rollback is surfaced as recovery needed", () => {
  const failed = {
    ...part,
    output: {
      success: false as const,
      error: "Write failed",
      rollbackFailedPaths: ["one.ts"],
    },
  };
  const html = renderToStaticMarkup(
    <WorkspaceEditRenderer part={failed} state={state} />,
  );
  expect(html).toContain("Recovery needed");
  expect(html).not.toContain(">Applied<");
});
