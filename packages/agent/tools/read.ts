import { tool } from "ai";
import { z } from "zod";
import { createHash } from "node:crypto";
import { readWindow } from "./read-window";
import { getSandbox, toDisplayPath } from "./utils";
import {
  isDotEnvFilePath,
  isSensitiveDotEnvPath,
  resolveSandboxRealPath,
  resolveWorkspacePath,
} from "./path-security";

const readInputSchema = z.object({
  filePath: z
    .string()
    .describe(
      "Workspace-relative path to the file to read (e.g., src/index.ts)",
    ),
  offset: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Line number to start reading from (1-indexed)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(2000)
    .optional()
    .describe(
      "Maximum lines (1-2000). Default: 200; output is capped at 16000 characters.",
    ),
  columnOffset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      "Use nextRead.columnOffset to continue a clipped long line. Default: 0.",
    ),
});

export const readFileTool = () =>
  tool({
    needsApproval: async ({ filePath }, { experimental_context }) => {
      if (isDotEnvFilePath(filePath)) {
        return true;
      }

      let sandbox;
      try {
        sandbox = await getSandbox(experimental_context, "read");
      } catch {
        return false;
      }
      const workingDirectory = sandbox.workingDirectory;
      const absolutePath = resolveWorkspacePath(filePath, workingDirectory);
      if (!absolutePath) {
        return false;
      }

      const realPath = await resolveSandboxRealPath({
        sandbox,
        absolutePath,
        workingDirectory,
      });

      return isSensitiveDotEnvPath({
        requestedPath: filePath,
        absolutePath,
        realPath,
      });
    },
    description: `Read a file from the filesystem.

USAGE:
- Use workspace-relative paths (e.g., "src/index.ts")
- Paths are resolved from the workspace root
- By default reads up to 200 lines starting from line 1 (at most 16000 characters)
- Use offset and limit for long files (both are line-based, 1-indexed)
- If nextRead is returned, pass its offset and columnOffset to continue without losing text
- Results include line numbers starting at 1 in "N: content" format

IMPORTANT:
- Always read a file at least once before editing it with the edit/write tools
- This tool can only read files, not directories - attempting to read a directory returns an error
- You can call multiple reads in parallel to speculatively load several files

EXAMPLES:
- Read an entire file: filePath: "src/index.ts"
- Read a slice of a long file: filePath: "logs/app.log", offset: 500, limit: 200`,
    inputSchema: readInputSchema,
    execute: async (
      { filePath, offset = 1, limit = 200, columnOffset = 0 },
      { experimental_context },
    ) => {
      const sandbox = await getSandbox(experimental_context, "read");
      const workingDirectory = sandbox.workingDirectory;

      try {
        const absolutePath = resolveWorkspacePath(filePath, workingDirectory);
        if (!absolutePath) {
          return {
            success: false as const,
            error: "Path must stay within the workspace.",
          };
        }

        const realPath = await resolveSandboxRealPath({
          sandbox,
          absolutePath,
          workingDirectory,
        });
        if (realPath && !resolveWorkspacePath(realPath, workingDirectory)) {
          return {
            success: false as const,
            error: "Path resolves outside the workspace.",
          };
        }

        const stats = await sandbox.stat(absolutePath);
        if (stats.isDirectory()) {
          return {
            success: false as const,
            error: "Cannot read a directory. Use glob or ls command instead.",
          };
        }

        const content = await sandbox.readFile(absolutePath, "utf-8");
        return {
          success: true as const,
          path: toDisplayPath(absolutePath, workingDirectory),
          ...readWindow(content, offset, limit, columnOffset),
          ...(realPath
            ? {
                readIdentity: {
                  path: realPath,
                  revision: createHash("sha256").update(content).digest("hex"),
                },
              }
            : {}),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false as const,
          error: `Failed to read file: ${message}`,
        };
      }
    },
  });
