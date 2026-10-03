import { z } from "zod";

export const codePositionSchema = z.object({
  filePath: z
    .string()
    .min(1)
    .max(500)
    .describe("Workspace-relative TS/JS source file"),
  line: z.number().int().min(1),
  column: z.number().int().min(1).describe("1-based UTF-16 column"),
});
export const codeInspectSchema = codePositionSchema.extend({
  action: z.enum(["symbols", "definitions", "references"]),
  limit: z.number().int().min(1).max(200).default(100),
});
export const codeRenameSchema = codePositionSchema.extend({
  newName: z.string().min(1).max(200),
  expectedRevision: z
    .string()
    .regex(/^[a-f0-9]{40,64}$/)
    .describe("Workspace revision from code_inspect"),
  dryRun: z
    .boolean()
    .default(true)
    .describe(
      "Preview by default; false applies through the shared edit engine",
    ),
});
export const intelligenceResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  availability: z.enum(["available", "unsupported", "unavailable", "stale"]),
  revision: z.string().nullable(),
  engine: z.string(),
  project: z.string().optional(),
  scope: z.string().optional(),
  truncated: z.boolean().optional(),
  omitted: z.number().optional(),
  locations: z
    .array(
      z.object({
        path: z.string(),
        line: z.number(),
        column: z.number(),
        endLine: z.number(),
        endColumn: z.number(),
        name: z.string().optional(),
        kind: z.string().optional(),
      }),
    )
    .optional(),
  readRevisions: z.record(z.string(), z.string()).optional(),
  operations: z
    .array(
      z.object({
        kind: z.literal("write"),
        path: z.string(),
        content: z.string(),
        expectedRevision: z.string(),
      }),
    )
    .optional(),
});
export type CodeInspectInput = z.infer<typeof codeInspectSchema>;
export type CodeRenameInput = z.infer<typeof codeRenameSchema>;
