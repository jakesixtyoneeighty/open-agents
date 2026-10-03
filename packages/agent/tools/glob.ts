import { tool } from "ai";
import { z } from "zod";
import {
  runWorkspaceSearch,
  searchStatus,
  toWorkspaceSearchPath,
} from "./workspace-search";

const globInputSchema = z.object({
  pattern: z
    .string()
    .optional()
    .describe(
      "Glob matched against paths relative to path (e.g., '**/*.ts'). Required unless cursor is set.",
    ),
  path: z
    .string()
    .optional()
    .describe("Workspace-relative base directory to search from (e.g., src)"),
  sort: z
    .enum(["modified", "path"])
    .optional()
    .describe("modified (newest first) or path. Default: modified"),
  includeHidden: z
    .boolean()
    .optional()
    .describe(
      "Include dot-files and dot-directories. Default: false (automatic when the pattern names one, e.g. '.github/**')",
    ),
  includeIgnored: z
    .boolean()
    .optional()
    .describe("Include gitignored files and node_modules. Default: false"),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum results per page (1-500). Default: 100"),
  cursor: z
    .string()
    .optional()
    .describe(
      "nextCursor from an earlier glob result. Returns the next page without rerunning the search; other fields except limit are ignored",
    ),
});

export const globTool = () =>
  tool({
    description: `Find files matching a glob pattern.

WHEN TO USE:
- Locating files by extension or naming pattern (e.g., all *.test.ts files)
- Discovering where components, migrations, or configs live
- Getting a list of recently modified files of a given type

WHEN NOT TO USE:
- Searching inside file contents (use grep instead)
- Reading file contents (use read instead)

USAGE:
- The pattern matches the whole path relative to path: "*.json" matches only that directory, "**/*.json" matches at any depth
- Supports *, ** (any number of directories), ?, [abc], [!abc] and {a,b} alternatives; quote special characters with backslash (e.g., "src/\\[id\\]/*.tsx")
- Returns FILES (not directories), newest first by default; sort: "path" for alphabetical order
- Results are paged. When nextCursor is present, call glob again with only cursor for the next page; totalFiles is the full count

POLICY:
- Lists only workspace files and never follows symlinks (skipped symlinks are reported)
- Skips .git, hidden paths, node_modules and gitignored files unless includeHidden/includeIgnored is set

EXAMPLES:
- All TypeScript files: pattern: "**/*.ts"
- Tests under src: pattern: "src/**/*.test.ts"
- Components in one route: pattern: "*.tsx", path: "app/sessions/[sessionId]"
- Recent JSON config files: pattern: "*.json", path: "config", limit: 20`,
    inputSchema: globInputSchema,
    execute: async (input, { experimental_context, abortSignal }) => {
      const result = await runWorkspaceSearch({
        context: experimental_context,
        toolName: "glob",
        kind: "files",
        limit: input.limit,
        cursor: input.cursor,
        abortSignal,
        buildQuery: (workingDirectory) => {
          if (!input.pattern) {
            return { error: "pattern is required unless cursor is set." };
          }
          const basePath = toWorkspaceSearchPath(input.path, workingDirectory);
          if (basePath === null) {
            return { error: "Path must stay within the workspace." };
          }
          return {
            kind: "files",
            path: basePath,
            pattern: input.pattern,
            sort: input.sort ?? "modified",
            includeHidden: input.includeHidden ?? false,
            includeIgnored: input.includeIgnored ?? false,
          };
        },
      });
      if (!result.success) return result;
      if (result.query.kind !== "files") {
        return { success: false as const, error: "Unexpected search result." };
      }
      const files = result.entries.flatMap((entry) =>
        "path" in entry ? [entry] : [],
      );
      return {
        success: true as const,
        pattern: result.query.pattern,
        baseDir: result.query.path || ".",
        count: files.length,
        totalFiles: result.totalFiles,
        files,
        ...searchStatus(result),
      };
    },
  });
