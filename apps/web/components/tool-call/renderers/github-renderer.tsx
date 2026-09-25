"use client";

import { Github } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";

type GitHubToolPartType =
  | "tool-github_pr_status"
  | "tool-github_check_logs"
  | "tool-github_pr_comments";

function getOutputError(output: unknown): string | undefined {
  if (typeof output !== "object" || output === null) return undefined;
  if (!("success" in output) || output.success !== false) return undefined;
  return "error" in output && typeof output.error === "string"
    ? output.error
    : "GitHub request failed";
}

function PrStatusRenderer({
  part,
  state,
}: ToolRendererProps<"tool-github_pr_status">) {
  const output = part.state === "output-available" ? part.output : undefined;
  const success = output?.success === true ? output : undefined;
  const prLabel = success
    ? `#${success.pr.number} ${success.pr.title}`
    : part.input?.prNumber
      ? `#${part.input.prNumber}`
      : "current branch";

  const meta = success
    ? success.summary.failed > 0
      ? `${success.summary.failed} failing`
      : success.summary.pending > 0
        ? `${success.summary.pending} pending`
        : `${success.summary.passed}/${success.summary.total} passed`
    : undefined;

  const expandedContent =
    success && success.checks.length > 0 ? (
      <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
        {success.checks
          .map((check) => `${check.state.padEnd(8)} ${check.name}`)
          .join("\n")}
      </pre>
    ) : undefined;

  return (
    <ToolLayout
      name="PR checks"
      icon={<Github className="h-3.5 w-3.5" />}
      summary={prLabel}
      meta={meta}
      state={withError(state, getOutputError(output))}
      expandedContent={expandedContent}
    />
  );
}

function CheckLogsRenderer({
  part,
  state,
}: ToolRendererProps<"tool-github_check_logs">) {
  const output = part.state === "output-available" ? part.output : undefined;
  const success = output?.success === true ? output : undefined;
  const summary = success
    ? success.check.name
    : `check ${part.input?.checkRunId ?? "..."}`;

  const expandedContent = success?.logTail ? (
    <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
      {success.logTail.split("\n").slice(-40).join("\n")}
    </pre>
  ) : undefined;

  return (
    <ToolLayout
      name="CI logs"
      icon={<Github className="h-3.5 w-3.5" />}
      summary={summary}
      meta={
        success && success.annotations.length > 0
          ? `${success.annotations.length} annotations`
          : (success?.check.conclusion ?? undefined)
      }
      state={withError(state, getOutputError(output))}
      expandedContent={expandedContent}
    />
  );
}

function PrCommentsRenderer({
  part,
  state,
}: ToolRendererProps<"tool-github_pr_comments">) {
  const output = part.state === "output-available" ? part.output : undefined;
  const success = output?.success === true ? output : undefined;
  const summary = success
    ? `#${success.prNumber}`
    : part.input?.prNumber
      ? `#${part.input.prNumber}`
      : "current branch";

  return (
    <ToolLayout
      name="PR comments"
      icon={<Github className="h-3.5 w-3.5" />}
      summary={summary}
      meta={success ? `${success.total} comments` : undefined}
      state={withError(state, getOutputError(output))}
    />
  );
}

function withError(
  state: ToolRendererProps<GitHubToolPartType>["state"],
  error: string | undefined,
) {
  return error ? { ...state, error: state.error ?? error } : state;
}

export { CheckLogsRenderer, PrCommentsRenderer, PrStatusRenderer };
