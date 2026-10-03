"use client";

import { Search } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";
import { summarizeGrepOutput } from "./search-output";
import { SearchOutputPanel } from "./search-output-panel";

/** Show at most the last 2 path segments */
function truncatePath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return `…/${parts.slice(-2).join("/")}`;
}

export function GrepRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<"tool-grep">) {
  const input = part.input;
  const isContinuation = Boolean(input?.cursor) && !input?.pattern;
  const pattern = input?.pattern ?? "...";
  const path = input?.path;

  const output = part.state === "output-available" ? part.output : undefined;
  const summary = summarizeGrepOutput(output);
  const location = path ? `in ${truncatePath(path)}` : "";

  return (
    <ToolLayout
      name="Grep"
      icon={<Search className="h-3.5 w-3.5" />}
      summary={
        isContinuation ? (
          <span className="text-muted-foreground">next page</span>
        ) : (
          <>
            <span className="font-mono">&apos;{pattern}&apos;</span>
            {location && (
              <span className="ml-1.5 text-muted-foreground/60">
                {location}
              </span>
            )}
          </>
        )
      }
      meta={summary?.meta}
      state={state}
      expandedContent={
        summary ? (
          <SearchOutputPanel summary={summary} emptyLabel="No matches" />
        ) : undefined
      }
      onApprove={onApprove}
      onDeny={onDeny}
    />
  );
}
