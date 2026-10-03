import { tool } from "ai";
import { z } from "zod";
import {
  runWorkspaceSearch,
  searchStatus,
  toWorkspaceSearchPath,
} from "./workspace-search";

const contextLines = z.number().int().min(0).max(20).optional();

const grepInputSchema = z.object({
  pattern: z
    .string()
    .optional()
    .describe(
      "Regex (default) or literal text. Required unless cursor is set.",
    ),
  path: z
    .string()
    .optional()
    .describe(
      "Workspace-relative file or directory to search (e.g., src). Default: workspace root",
    ),
  mode: z
    .enum(["regex", "literal"])
    .optional()
    .describe(
      "regex or literal (exact text, no escaping needed). Default: regex",
    ),
  output: z
    .enum(["content", "files", "count"])
    .optional()
    .describe(
      "content: matching lines; files: paths containing matches; count: matching lines per file. Default: content",
    ),
  glob: z
    .string()
    .optional()
    .describe(
      "File filter. Without '/', matches file names at any depth ('*.ts', '*.{ts,tsx}'); with '/', matches paths relative to path ('src/**/*.test.ts')",
    ),
  caseSensitive: z
    .boolean()
    .optional()
    .describe("Case-sensitive search. Default: true"),
  context: contextLines.describe(
    "Lines of context before and after each match (0-20, content output)",
  ),
  before: contextLines.describe("Lines before each match; overrides context"),
  after: contextLines.describe("Lines after each match; overrides context"),
  includeHidden: z
    .boolean()
    .optional()
    .describe("Search dot-files and dot-directories. Default: false"),
  includeIgnored: z
    .boolean()
    .optional()
    .describe("Search gitignored files and node_modules. Default: false"),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Maximum results per page (1-500). Default: 100; pages also stop near 16000 characters",
    ),
  cursor: z
    .string()
    .optional()
    .describe(
      "nextCursor from an earlier grep result. Returns the next page of that search without rerunning it; other fields except limit are ignored",
    ),
});

export const grepTool = () =>
  tool({
    description: `Search file contents in the workspace.

WHEN TO USE:
- Finding where a function, variable, or string literal is used
- Locating configuration keys, routes, or error messages across files
- Counting usages or listing which files contain a pattern

WHEN NOT TO USE:
- Simple filename-only searches (use glob instead)
- Complex, multi-round codebase exploration (use task with detailed instructions)

USAGE:
- mode "regex" (default) uses JavaScript regular expressions: \\s, \\w, \\d, \\b, lookarounds; POSIX classes like [[:space:]] also work
- mode "literal" matches the exact text, so "foo(bar.baz)" needs no escaping
- Matches are single-line. Each result has file, line, a 1-based column and the line content
- output "files" lists matching paths; output "count" gives matching lines per file
- Use context/before/after for surrounding lines
- Long lines are windowed around the match (truncated: true, contentOffset); read with columnOffset for the rest
- Results are paged. When nextCursor is present, call grep again with only cursor to get the next page; it reads stored results and never repeats earlier ones
- matchCount and filesWithMatches are totals for the whole search; complete: false means the scan paused and totals are lower bounds

POLICY:
- Searches only inside the workspace and never follows symlinks
- Skips .git, hidden paths, node_modules and gitignored files unless includeHidden/includeIgnored is set
- Never returns dotenv file contents; binary, oversized (>4 MiB) and skipped files are reported in skipped

IMPORTANT:
- ALWAYS use this tool for code/content searches instead of running grep/rg via bash

EXAMPLES:
- TODOs in TypeScript: pattern: "TODO", path: "src", glob: "*.ts"
- Exact call text: pattern: "useState<Map<", mode: "literal"
- Files that import a module: pattern: "from \\"zod\\"", output: "files"
- Next page: cursor: "<nextCursor>"`,
    inputSchema: grepInputSchema,
    execute: async (input, { experimental_context, abortSignal }) => {
      const result = await runWorkspaceSearch({
        context: experimental_context,
        toolName: "grep",
        kind: "content",
        limit: input.limit,
        cursor: input.cursor,
        abortSignal,
        buildQuery: (workingDirectory) => {
          if (!input.pattern) {
            return { error: "pattern is required unless cursor is set." };
          }
          const searchPath = toWorkspaceSearchPath(
            input.path,
            workingDirectory,
          );
          if (searchPath === null) {
            return { error: "Path must stay within the workspace." };
          }
          return {
            kind: "content",
            path: searchPath,
            pattern: input.pattern,
            mode: input.mode ?? "regex",
            caseSensitive: input.caseSensitive ?? true,
            ...(input.glob ? { glob: input.glob } : {}),
            output: input.output ?? "content",
            before: input.before ?? input.context ?? 0,
            after: input.after ?? input.context ?? 0,
            includeHidden: input.includeHidden ?? false,
            includeIgnored: input.includeIgnored ?? false,
          };
        },
      });
      if (!result.success) return result;
      if (result.query.kind !== "content") {
        return { success: false as const, error: "Unexpected search result." };
      }
      const { query } = result;
      const entries =
        query.output === "content"
          ? { matches: result.entries }
          : query.output === "count"
            ? { counts: result.entries }
            : {
                files: result.entries.flatMap((entry) =>
                  "file" in entry ? [entry.file] : [],
                ),
              };
      return {
        success: true as const,
        pattern: query.pattern,
        mode: query.mode,
        output: query.output,
        path: query.path || ".",
        ...(query.glob ? { glob: query.glob } : {}),
        matchCount: result.totalMatches,
        filesWithMatches: result.totalFiles,
        ...entries,
        ...searchStatus(result),
      };
    },
  });
