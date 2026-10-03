"use client";

import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";

export function BrowserRenderer({
  part,
  state,
}: ToolRendererProps<
  "tool-browser_session" | "tool-browser_inspect" | "tool-browser_action"
>) {
  const output = part.state === "output-available" ? part.output : undefined;
  const label =
    part.type === "tool-browser_action"
      ? "Browser action"
      : part.type === "tool-browser_session"
        ? "Browser session"
        : "Inspect browser";
  return (
    <ToolLayout
      name={label}
      errorMeta="Failed"
      summary={
        output?.url ??
        (part.input && "url" in part.input ? part.input.url : label)
      }
      state={
        output?.success === false
          ? { ...state, error: output.error ?? "Browser verification failed" }
          : state
      }
      meta={
        output
          ? output.closed
            ? "Closed"
            : output.action
              ? `${output.action}: ${output.success ? "completed" : "failed"}`
              : "Inspection only"
          : undefined
      }
      expandedContent={
        output ? (
          <div className="space-y-3 text-xs">
            <p className="text-muted-foreground">
              {output.viewport}{" "}
              {output.status != null ? `· HTTP ${output.status}` : ""}{" "}
              {output.title ? `· ${output.title}` : ""}
            </p>
            {output.error && <p className="text-destructive">{output.error}</p>}
            {output.evidenceId && (
              <p className="break-all font-mono text-muted-foreground">
                Evidence {output.evidenceId}
                {output.capturedAt
                  ? ` · ${new Date(output.capturedAt).toISOString()}`
                  : ""}
              </p>
            )}
            {output.focused && <p>Keyboard focus: {output.focused}</p>}
            {output.snapshot && (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3">
                {output.snapshot}
              </pre>
            )}
            {output.truncated &&
              (output.truncated.snapshot ||
                output.truncated.console > 0 ||
                output.truncated.network > 0) && (
                <p className="text-muted-foreground">
                  Evidence is bounded:{" "}
                  {output.truncated.snapshot
                    ? "accessibility snapshot clipped; "
                    : ""}
                  {output.truncated.console} older console events and{" "}
                  {output.truncated.network} older network events omitted.
                </p>
              )}
            {!!output.console?.length && (
              <details>
                <summary>Console ({output.console.length})</summary>
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words">
                  {output.console
                    .map((event) => `[${event.type}] ${event.text}`)
                    .join("\n")}
                </pre>
              </details>
            )}
            {!!output.network?.length && (
              <details>
                <summary>Network ({output.network.length})</summary>
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words">
                  {output.network
                    .map(
                      (event) =>
                        `${event.method} ${event.status ?? event.error ?? "pending"} ${event.url}`,
                    )
                    .join("\n")}
                </pre>
              </details>
            )}
            <p className="text-muted-foreground">
              Point-in-time evidence. Completed input events alone do not prove
              a flow passed.
            </p>
          </div>
        ) : undefined
      }
    />
  );
}
