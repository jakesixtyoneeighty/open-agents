import type { SearchOutputSummary } from "./search-output";

export function SearchOutputPanel({
  summary,
  emptyLabel,
}: {
  summary: SearchOutputSummary;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
        {summary.lines.length > 0 ? summary.lines.join("\n") : emptyLabel}
      </pre>
      {summary.notes.map((note) => (
        <p key={note} className="text-xs text-muted-foreground">
          {note}
        </p>
      ))}
    </div>
  );
}
