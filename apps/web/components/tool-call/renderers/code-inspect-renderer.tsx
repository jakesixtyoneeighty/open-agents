"use client";

import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";
import { FileNamePill } from "../file-name-pill";
import { useCheckFreshness } from "../check-freshness";

export function CodeInspectRenderer({
  part,
  state,
}: ToolRendererProps<"tool-code_inspect">) {
  const output = part.state === "output-available" ? part.output : undefined;
  const freshness = useCheckFreshness(part.toolCallId);
  return (
    <ToolLayout
      name="Code intelligence"
      summary={`${part.input?.action ?? "Inspect"} ${part.input?.filePath ?? ""}`}
      meta={
        output?.success
          ? freshness === "current"
            ? `${output.locations?.length ?? 0} locations`
            : freshness === "stale"
              ? "Stale"
              : "May be stale"
          : undefined
      }
      state={
        output && !output.success
          ? { ...state, error: output.error ?? output.availability }
          : state
      }
      errorMeta={output?.availability}
      expandedContent={
        output ? (
          <div className="max-h-96 space-y-2 overflow-auto rounded-md border border-border p-3 text-xs">
            <p>
              {output.engine} · {output.availability}
            </p>
            {output.revision && (
              <p className="font-mono">
                Revision {output.revision.slice(0, 12)}
              </p>
            )}
            <p>{output.project}</p>
            <p className="text-muted-foreground">{output.scope}</p>
            {output.locations?.map((location, index) => (
              <div
                key={`${location.path}:${location.line}:${location.column}:${index}`}
                className="flex items-center gap-2"
              >
                <FileNamePill filePath={location.path} />
                <span>
                  {location.line}:{location.column}
                </span>
                <span>{location.name ?? location.kind}</span>
              </div>
            ))}
            {(output.omitted ?? 0) > 0 && (
              <p>
                {output.omitted} locations omitted. Narrow the query or use
                search.
              </p>
            )}
            {output.error && <p>{output.error}</p>}
          </div>
        ) : undefined
      }
    />
  );
}
