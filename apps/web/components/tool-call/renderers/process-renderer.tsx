"use client";

import { Terminal } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";

export function processStatusLabel(record: {
  state: string;
  readiness: string;
  exitCode: number | null;
}) {
  if (record.state === "exited")
    return `exited ${record.exitCode ?? "unknown"}`;
  if (record.state === "running" || record.state === "starting") {
    return `${record.state} · ${record.readiness === "ready" ? "readiness observed" : record.readiness === "pending" ? "readiness pending" : "readiness not checked"}`;
  }
  return record.state.replaceAll("_", " ");
}

export function ProcessRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<"tool-process">) {
  const input = part.input;
  const output = part.state === "output-available" ? part.output : undefined;
  const record = output?.process;
  const failed =
    output?.success === false ||
    record?.state === "error" ||
    record?.state === "timed_out" ||
    record?.state === "expired" ||
    (record?.state === "exited" && record.exitCode !== 0);
  const label = output?.waitTimedOut
    ? "wait timed out · job continues"
    : record
      ? processStatusLabel(record)
      : output?.processes
        ? `${output.processes.length} jobs`
        : undefined;
  const summary =
    input?.action === "start" ? input.command : (input?.action ?? "process");

  return (
    <ToolLayout
      name="Process"
      summary={summary || "..."}
      summaryClassName="font-mono"
      icon={<Terminal className="h-3.5 w-3.5" />}
      meta={label}
      errorMeta={label}
      state={
        failed
          ? {
              ...state,
              error:
                output?.error ?? record?.error ?? label ?? "Process failed",
            }
          : state
      }
      onApprove={onApprove}
      onDeny={onDeny}
      expandedContent={
        output ? (
          <div className="space-y-2 text-xs text-muted-foreground">
            {output.error && <p className="text-red-500">{output.error}</p>}
            {[...(record ? [record] : []), ...(output.processes ?? [])].map(
              (job) => (
                <div
                  key={job.processId}
                  className="space-y-1 rounded-md border border-border p-2"
                >
                  <p className="break-all font-mono text-foreground">
                    {job.command}
                  </p>
                  <p>
                    {processStatusLabel(job)}
                    {job.signal ? ` · ${job.signal}` : ""}
                  </p>
                  <p className="break-all">Process ID: {job.processId}</p>
                  <p className="break-all">Log ID: {job.commandId}</p>
                  <p>Deadline: {new Date(job.deadlineAt).toISOString()}</p>
                  {job.readinessDetail && <p>{job.readinessDetail}</p>}
                  {job.error && <p className="text-red-500">{job.error}</p>}
                  {job.logsTruncated && (
                    <p>
                      Logs truncated: only the first 1 MiB per stream is
                      retained.
                    </p>
                  )}
                </div>
              ),
            )}
            {output.waitTimedOut && (
              <p>
                Only this wait expired. The job continues until its deadline or
                a stop request.
              </p>
            )}
            {output.log && (
              <>
                <p>
                  {output.log.stream} · offset {output.log.offset}
                  {output.log.nextOffset !== undefined
                    ? ` · next offset ${output.log.nextOffset}`
                    : " · end of retained output"}
                </p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-3 font-mono text-xs">
                  {output.log.content || "(No output yet)"}
                </pre>
                {output.log.truncated && (
                  <p>
                    Log retention limit reached; later output was discarded.
                  </p>
                )}
              </>
            )}
            {output.observedAt && (
              <p>
                Observed {new Date(output.observedAt).toISOString()}. Status is
                a snapshot; poll to refresh.
              </p>
            )}
          </div>
        ) : undefined
      }
    />
  );
}
