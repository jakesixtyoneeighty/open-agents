import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ToolRenderState } from "@open-agents/shared/lib/tool-state";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import type { WebAgentUIMessage } from "@/app/types";
import { CheckFreshnessProvider } from "../check-freshness";
import { RunChecksRenderer } from "./run-checks-renderer";
import { summarizeRunChecks } from "./run-checks-output";

const state: ToolRenderState = {
  running: false,
  interrupted: false,
  denied: false,
  approvalRequested: false,
  isActiveApproval: false,
};

const output = {
  success: true as const,
  passed: true,
  revision: "a".repeat(40),
  headCommit: null,
  dirty: true,
  checks: [
    {
      id: "typecheck",
      kind: "typecheck" as const,
      command: "pnpm run typecheck",
      cwd: ".",
      status: "passed" as const,
      exitCode: 0,
      durationMs: 1200,
      revision: "a".repeat(40),
      verdict: "fixed" as const,
      diagnosticCount: 0,
      diagnostics: [],
      baseline: null,
    },
  ],
};

test("run summaries describe failures, origins and kept logs", () => {
  const summary = summarizeRunChecks({
    success: true,
    passed: false,
    revision: "b".repeat(40),
    checks: [
      {
        id: "lint",
        command: "pnpm run lint",
        status: "failed",
        verdict: "new_failure",
        diagnosticCount: 1,
        diagnostics: [
          {
            file: "src/a.ts",
            line: 3,
            column: 1,
            origin: "new",
            code: "no-x",
            message: "bad",
            severity: "error",
          },
        ],
      },
      {
        id: "test",
        command: "pnpm run test",
        status: "timed_out",
        output: { stdout: "", stderr: "slow" },
      },
    ],
  });
  expect(summary).toMatchObject({
    kind: "run",
    passed: 0,
    failed: 1,
    incomplete: 1,
    rows: [
      {
        verdictLabel: "new failure",
        diagnostics: ["src/a.ts:3:1  [new]  no-x  bad"],
      },
      { status: "timed_out", output: "slow" },
    ],
  });
});

test("a passing card is labeled stale after a later edit", () => {
  const part: ToolRendererProps<"tool-run_checks">["part"] = {
    type: "tool-run_checks",
    toolCallId: "checks",
    state: "output-available",
    input: {},
    output,
  };
  const messages = [
    {
      id: "m",
      role: "assistant",
      parts: [
        part,
        {
          type: "tool-edit",
          toolCallId: "edit",
          state: "output-available",
          input: { filePath: "a.ts", oldString: "a", newString: "b" },
          output: { success: true },
        },
      ],
    },
  ] as unknown as WebAgentUIMessage[];
  const html = renderToStaticMarkup(
    <CheckFreshnessProvider messages={messages}>
      <RunChecksRenderer part={part} state={state} />
    </CheckFreshnessProvider>,
  );
  expect(html).toContain("1 passed · stale");
  expect(
    renderToStaticMarkup(<RunChecksRenderer part={part} state={state} />),
  ).not.toContain("stale");
});
