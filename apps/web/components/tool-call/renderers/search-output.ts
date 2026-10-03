/** Display summaries for grep/glob outputs, including legacy unpaged results. */

export type SearchOutputSummary = {
  lines: string[];
  meta: string;
  notes: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function plural(count: number, noun: string) {
  if (count === 1) return `${count} ${noun}`;
  return `${count} ${noun}${noun.endsWith("ch") ? "es" : "s"}`;
}

function numberField(output: Record<string, unknown>, key: string) {
  const value = output[key];
  return typeof value === "number" ? value : undefined;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function pagingNotes(
  output: Record<string, unknown>,
  returned: number,
  total: number,
  noun: string,
) {
  const notes: string[] = [];
  if (output.complete === false) {
    notes.push(
      "Scan paused before every file was searched; totals are lower bounds.",
    );
  }
  if (typeof output.nextCursor === "string") {
    notes.push(
      `Showing ${returned} of ${plural(total, noun)} on this page; more pages are available.`,
    );
  }
  if (isRecord(output.skipped)) {
    const skipped = Object.entries(output.skipped).flatMap(([reason, value]) =>
      isRecord(value) && typeof value.count === "number"
        ? [`${value.count} ${reason}`]
        : [],
    );
    if (skipped.length) notes.push(`Skipped files: ${skipped.join(", ")}.`);
  }
  return notes;
}

export function summarizeGrepOutput(
  output: unknown,
): SearchOutputSummary | null {
  if (!isRecord(output) || output.success === false) return null;
  const suffix = output.complete === false ? "+" : "";
  if (Array.isArray(output.counts)) {
    const counts = records(output.counts).filter(
      (entry) =>
        typeof entry.file === "string" && typeof entry.count === "number",
    );
    const total = numberField(output, "matchCount") ?? 0;
    return {
      lines: counts.map(
        (entry) => `${String(entry.count).padStart(5)}  ${String(entry.file)}`,
      ),
      meta: `${plural(total, "match")}${suffix}`,
      notes: pagingNotes(
        output,
        counts.length,
        numberField(output, "filesWithMatches") ?? counts.length,
        "file",
      ),
    };
  }
  if (Array.isArray(output.files) && !Array.isArray(output.matches)) {
    const files = output.files.filter(
      (file): file is string => typeof file === "string",
    );
    const total = numberField(output, "filesWithMatches") ?? files.length;
    return {
      lines: files,
      meta: `${plural(total, "file")}${suffix}`,
      notes: pagingNotes(output, files.length, total, "file"),
    };
  }
  const matches = records(output.matches).filter(
    (match) => typeof match.file === "string" && typeof match.line === "number",
  );
  const total = numberField(output, "matchCount") ?? matches.length;
  const files =
    numberField(output, "filesWithMatches") ??
    new Set(matches.map((match) => match.file)).size;
  return {
    lines: matches.map((match) => {
      const content =
        typeof match.content === "string" ? match.content.trim() : "";
      return `${String(match.file)}:${String(match.line)}${content ? `  ${content}` : ""}`;
    }),
    meta:
      total === 0
        ? "No matches"
        : `${plural(total, "match")}${suffix} in ${plural(files, "file")}${suffix}`,
    notes: pagingNotes(output, matches.length, total, "match"),
  };
}

export function summarizeGlobOutput(
  output: unknown,
): SearchOutputSummary | null {
  if (!isRecord(output) || output.success === false) return null;
  const files = records(output.files).flatMap((file) =>
    typeof file.path === "string" ? [file.path] : [],
  );
  const total = numberField(output, "totalFiles") ?? files.length;
  return {
    lines: files,
    meta:
      total === 0
        ? "No files"
        : `${plural(total, "file")}${output.complete === false ? "+" : ""}`,
    notes: pagingNotes(output, files.length, total, "file"),
  };
}
