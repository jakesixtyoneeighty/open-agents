"use client";

import { ListChecks } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { useCheckFreshness } from "../check-freshness";
import { ToolLayout } from "../tool-layout";
import { type CheckRow, summarizeRunChecks } from "./run-checks-output";

const STATUS_CLASS: Record<string, string> = {
  passed: "text-green-600 dark:text-green-500",
  failed: "text-red-500",
};

function formatDuration(ms: number | undefined) {
  if (ms === undefined) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function CheckRowView({ row }: { row: CheckRow }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
        <span
          className={
            STATUS_CLASS[row.status] ?? "text-yellow-600 dark:text-yellow-500"
          }
        >
          {row.status.replace("_", " ")}
        </span>
        <span className="font-mono text-foreground">{row.id}</span>
        <span className="text-muted-foreground">
          {formatDuration(row.durationMs)}
        </span>
        {row.verdictLabel && (
          <span className="text-muted-foreground">· {row.verdictLabel}</span>
        )}
        {row.revisionChanged && (
          <span className="text-yellow-600 dark:text-yellow-500">
            · files changed during run
          </span>
        )}
      </div>
      {row.diagnostics.length > 0 && (
        <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/50 p-2 font-mono text-xs leading-relaxed text-muted-foreground">
          {row.diagnostics.join("\n")}
          {row.diagnosticCount > row.diagnostics.length &&
            `\n… ${row.diagnosticCount - row.diagnostics.length} more`}
        </pre>
      )}
      {row.output && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-2 font-mono text-xs leading-relaxed text-muted-foreground">
          {row.output}
        </pre>
      )}
    </div>
  );
}

export function RunChecksRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<"tool-run_checks">) {
  const freshness = useCheckFreshness(part.toolCallId);
  const output = part.state === "output-available" ? part.output : undefined;
  const summary = summarizeRunChecks(output);
  const requested = part.input?.checks?.join(", ");
  const label =
    part.input?.action === "list"
      ? "list checks"
      : requested ||
        (summary?.kind === "run"
          ? summary.rows.map((row) => row.id).join(", ")
          : "default checks");

  let meta: string | undefined;
  let errorMeta: string | undefined;
  if (summary?.kind === "run") {
    const counts = [
      summary.passed ? `${summary.passed} passed` : "",
      summary.failed ? `${summary.failed} failed` : "",
      summary.incomplete ? `${summary.incomplete} incomplete` : "",
    ].filter(Boolean);
    const staleness =
      freshness === "stale"
        ? " · stale"
        : freshness === "maybe_stale"
          ? " · may be stale"
          : "";
    meta = `${counts.join(" · ")}${staleness}`;
    if (summary.failed || summary.incomplete) errorMeta = meta;
  }
  const mergedState =
    errorMeta && !state.error ? { ...state, error: errorMeta } : state;

  const expandedContent = summary ? (
    <div className="space-y-3">
      {summary.kind === "run" ? (
        <>
          {summary.rows.map((row) => (
            <CheckRowView key={row.id} row={row} />
          ))}
          <p className="text-xs text-muted-foreground">
            {summary.revision
              ? `Checked working tree ${summary.revision}.`
              : "Not bound to a revision."}
            {freshness === "stale" &&
              " Files were edited afterwards; these results no longer describe the code."}
            {freshness === "maybe_stale" &&
              " Later commands or tasks may have changed files; rerun before relying on a pass."}
          </p>
        </>
      ) : (
        <pre className="overflow-auto rounded-md border border-border bg-muted/50 p-2 font-mono text-xs leading-relaxed text-muted-foreground">
          {summary.rows
            .map(
              (row) =>
                `${row.id.padEnd(16)} ${row.latest ?? "never run"}  ${row.command}`,
            )
            .join("\n")}
        </pre>
      )}
      {summary.note && (
        <p className="text-xs text-muted-foreground">{summary.note}</p>
      )}
    </div>
  ) : undefined;

  return (
    <ToolLayout
      name="Checks"
      icon={<ListChecks className="h-3.5 w-3.5" />}
      summary={label}
      summaryClassName="font-mono"
      meta={errorMeta ? undefined : meta}
      errorMeta={errorMeta}
      state={mergedState}
      expandedContent={expandedContent}
      onApprove={onApprove}
      onDeny={onDeny}
    />
  );
}
