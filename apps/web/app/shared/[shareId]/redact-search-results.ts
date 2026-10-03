import { posix } from "node:path";

const REDACTED_MATCH_LINE = "[redacted from shared page]";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEnvFile(file: unknown) {
  return (
    typeof file === "string" &&
    posix.basename(file.replaceAll("\\", "/")).toLowerCase().startsWith(".env")
  );
}

function redactLines(lines: unknown) {
  return Array.isArray(lines)
    ? lines.map((line) =>
        isRecord(line) ? { ...line, content: REDACTED_MATCH_LINE } : line,
      )
    : lines;
}

/**
 * Current grep never searches dotenv files, but older transcripts may hold
 * matches from them (for example a direct path search). Paths stay visible.
 */
export function sanitizeGrepOutput(output: unknown): unknown {
  if (!isRecord(output) || !Array.isArray(output.matches)) return output;
  return {
    ...output,
    matches: output.matches.map((match) =>
      isRecord(match) && isEnvFile(match.file)
        ? {
            ...match,
            content: REDACTED_MATCH_LINE,
            ...(match.before ? { before: redactLines(match.before) } : {}),
            ...(match.after ? { after: redactLines(match.after) } : {}),
          }
        : match,
    ),
  };
}
