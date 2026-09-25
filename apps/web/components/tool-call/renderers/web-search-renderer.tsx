"use client";

import { Search } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";

export function WebSearchRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<"tool-web_search">) {
  const query = part.input?.query ?? "...";

  const output = part.state === "output-available" ? part.output : undefined;
  const results = output?.success === true ? output.results : [];
  const outputError =
    output?.success === false ? (output.error ?? "Search failed") : undefined;

  const mergedState = outputError
    ? { ...state, error: state.error ?? outputError }
    : state;

  const expandedContent =
    results.length > 0 ? (
      <ul className="max-h-64 space-y-2 overflow-auto rounded-md border border-border bg-muted/50 p-3 text-xs">
        {results.map((result) => (
          <li key={result.url} className="min-w-0">
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate font-medium text-foreground hover:underline"
            >
              {result.title}
            </a>
            <span className="block truncate font-mono text-muted-foreground/70">
              {result.url}
            </span>
          </li>
        ))}
      </ul>
    ) : undefined;

  return (
    <ToolLayout
      name="Search"
      icon={<Search className="h-3.5 w-3.5" />}
      summary={`"${query}"`}
      meta={results.length > 0 ? `${results.length} results` : undefined}
      state={mergedState}
      expandedContent={expandedContent}
      onApprove={onApprove}
      onDeny={onDeny}
    />
  );
}
