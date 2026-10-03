import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ToolRenderState } from "@open-agents/shared/lib/tool-state";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import type { WebAgentUIMessage } from "@/app/types";
import { CheckFreshnessProvider } from "../check-freshness";
import { CodeInspectRenderer } from "./code-inspect-renderer";
import { McpConnectorRenderer } from "./mcp-connector-renderer";
import { WorkspaceEditRenderer } from "./workspace-edit-renderer";

const state: ToolRenderState = {
  running: false,
  interrupted: false,
  denied: false,
  approvalRequested: false,
  isActiveApproval: false,
};
const inspect: ToolRendererProps<"tool-code_inspect">["part"] = {
  type: "tool-code_inspect",
  toolCallId: "inspect",
  state: "output-available",
  input: {
    action: "references",
    filePath: "source.ts",
    line: 1,
    column: 1,
    limit: 100,
  },
  output: {
    success: true,
    availability: "available",
    engine: "TypeScript",
    revision: "a".repeat(40),
    locations: [],
  },
};
const rename: ToolRendererProps<"tool-code_rename">["part"] = {
  type: "tool-code_rename",
  toolCallId: "rename",
  state: "output-available",
  input: {
    filePath: "source.ts",
    line: 1,
    column: 1,
    newName: "renamed",
    expectedRevision: "a".repeat(40),
    dryRun: false,
  },
  output: {
    success: true,
    changeSetId: "a".repeat(64),
    dryRun: false,
    replacements: 0,
    changes: [],
  },
};

test("semantic rename has grouped edit UI and makes earlier intelligence stale", () => {
  const messages: WebAgentUIMessage[] = [
    { id: "message", role: "assistant", parts: [inspect, rename] },
  ];
  const html = renderToStaticMarkup(
    <CheckFreshnessProvider messages={messages}>
      <CodeInspectRenderer part={inspect} state={state} />
      <WorkspaceEditRenderer part={rename} state={state} />
    </CheckFreshnessProvider>,
  );
  expect(html).toContain("Stale");
  expect(html).toContain("Rename symbol");
  expect(html).toContain("Applied");
});

test("unconfigured connector and unavailable intelligence do not claim completion", () => {
  const connector: ToolRendererProps<"tool-mcp_connector">["part"] = {
    type: "tool-mcp_connector",
    toolCallId: "connector",
    state: "output-available",
    input: { action: "list" },
    output: { success: true, availability: "not_configured", connectors: [] },
  };
  expect(
    renderToStaticMarkup(
      <McpConnectorRenderer part={connector} state={state} />,
    ),
  ).toContain("not configured");
  const unavailable = {
    ...inspect,
    output: {
      success: false,
      availability: "unsupported" as const,
      revision: null,
      engine: "TypeScript",
      error: "Unsupported language",
    },
  };
  const html = renderToStaticMarkup(
    <CodeInspectRenderer part={unavailable} state={state} />,
  );
  expect(html).toContain("unsupported");
  expect(html).not.toContain("0 locations");
});

test("MCP approval displays the exact external tool and arguments before execution", () => {
  const part: ToolRendererProps<"tool-mcp_connector">["part"] = {
    type: "tool-mcp_connector",
    toolCallId: "call",
    state: "approval-requested",
    approval: { id: "approval" },
    input: {
      action: "call",
      connectorId: "docs",
      toolName: "publish_document",
      arguments: { title: "Review this title" },
    },
  };
  const html = renderToStaticMarkup(
    <McpConnectorRenderer
      part={part}
      state={{ ...state, approvalRequested: true, approvalId: "approval" }}
    />,
  );
  expect(html).toContain("publish_document");
  expect(html).toContain("Review this title");
});
