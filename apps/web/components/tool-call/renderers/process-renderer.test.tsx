import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ToolRendererProps, ToolRenderState } from "@/app/lib/render-tool";
import { ProcessRenderer, processStatusLabel } from "./process-renderer";
import { CommandOutputRenderer } from "./command-output-renderer";

const state: ToolRenderState = {
  running: false,
  interrupted: false,
  denied: false,
  approvalRequested: false,
  isActiveApproval: false,
};
const record = {
  processId: "a".repeat(64),
  commandId: `process:${"a".repeat(64)}`,
  command: "pnpm dev",
  cwd: "/repo",
  state: "running" as const,
  readiness: "pending" as const,
  startedAt: 1,
  deadlineAt: 3600001,
  exitCode: null,
  logsTruncated: false,
};
const part: ToolRendererProps<"tool-process">["part"] = {
  type: "tool-process",
  toolCallId: "p",
  state: "output-available",
  input: { action: "start", command: "pnpm dev", timeoutSeconds: 3600 },
  output: { success: true, process: record },
};

test("process cards separate launch, readiness, wait timeout and runtime timeout", () => {
  expect(
    renderToStaticMarkup(<ProcessRenderer part={part} state={state} />),
  ).toContain("readiness pending");
  expect(
    processStatusLabel({ ...record, readiness: "not_configured" }),
  ).toContain("readiness not checked");
  expect(processStatusLabel({ ...record, readiness: "ready" })).toContain(
    "readiness observed",
  );
  const waiting = {
    ...part,
    output: { success: true, process: record, waitTimedOut: true },
  };
  expect(
    renderToStaticMarkup(<ProcessRenderer part={waiting} state={state} />),
  ).toContain("wait timed out · job continues");
  expect(processStatusLabel({ ...record, state: "timed_out" })).toBe(
    "timed out",
  );
});

test("nonzero completion and expired processes do not appear successful", () => {
  for (const status of ["exited", "expired"] as const) {
    const failed = {
      ...part,
      output: {
        success: true,
        process: { ...record, state: status, exitCode: 7 },
      },
    };
    const html = renderToStaticMarkup(
      <ProcessRenderer part={failed} state={state} />,
    );
    expect(html).toContain("lucide-circle-x");
    expect(html).toContain(status === "exited" ? "exited 7" : "expired");
  }
});

test("command log cards expose continuation instead of generic Done", () => {
  const log: ToolRendererProps<"tool-command_output">["part"] = {
    type: "tool-command_output",
    toolCallId: "log",
    state: "output-available",
    input: {
      commandId: record.commandId,
      stream: "stdout",
      offset: 0,
      limit: 8000,
    },
    output: {
      success: true,
      commandId: record.commandId,
      stream: "stdout",
      content: "ready",
      offset: 0,
      totalCharacters: 9000,
      nextOffset: 8000,
    },
  };
  expect(
    renderToStaticMarkup(<CommandOutputRenderer part={log} state={state} />),
  ).toContain("offset 0 · next 8000");
});
