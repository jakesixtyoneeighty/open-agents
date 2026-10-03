"use client";

import { Terminal } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";

export function CommandOutputRenderer({
  part,
  state,
}: ToolRendererProps<"tool-command_output">) {
  const output = part.state === "output-available" ? part.output : undefined;
  const log = output && "content" in output ? output : undefined;
  const error = output && "error" in output ? output.error : undefined;
  return (
    <ToolLayout
      name="Command logs"
      summary={part.input?.stream ?? "logs"}
      icon={<Terminal className="h-3.5 w-3.5" />}
      state={error ? { ...state, error } : state}
      meta={
        log
          ? `offset ${log.offset}${log.nextOffset !== undefined ? ` · next ${log.nextOffset}` : " · end of retained output"}`
          : undefined
      }
      expandedContent={
        log ? (
          <div className="space-y-2 text-xs text-muted-foreground">
            <p className="break-all">{part.input?.commandId}</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-3 font-mono text-xs">
              {log.content || "(No output yet)"}
            </pre>
            {"truncated" in log && log.truncated === true && (
              <p>Log retention limit reached; later output was discarded.</p>
            )}
          </div>
        ) : error ? (
          <p className="text-xs text-red-500">{error}</p>
        ) : undefined
      }
    />
  );
}
