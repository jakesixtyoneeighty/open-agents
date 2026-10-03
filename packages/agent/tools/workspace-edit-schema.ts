import { z } from "zod";

export const fileRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const replacementSchema = z.object({
  oldString: z.string().min(1),
  newString: z.string(),
  replaceAll: z.boolean().optional(),
});

export const workspaceEditOutputSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    changeSetId: fileRevisionSchema,
    dryRun: z.boolean(),
    replayed: z.boolean().optional(),
    replacements: z.number(),
    startLine: z.number().optional(),
    changes: z.array(
      z.object({
        path: z.string(),
        before: z.string().nullable(),
        after: z.string().nullable(),
        beforeRevision: z.string().nullable(),
        afterRevision: z.string().nullable(),
        redacted: z.boolean().optional(),
        revertStatus: z
          .enum(["exact", "merged", "unchanged", "conflict"])
          .optional(),
        reason: z.string().optional(),
      }),
    ),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
    changeSetId: z.string().optional(),
    rollbackFailedPaths: z.array(z.string()).optional(),
  }),
]);

export type WorkspaceEditOutput = z.infer<typeof workspaceEditOutputSchema>;

export function compactWorkspaceEditResult(output: WorkspaceEditOutput) {
  if (!output.success) return output;
  return {
    ...output,
    changes: output.changes.map(({ path, beforeRevision, afterRevision }) => ({
      path,
      beforeRevision,
      afterRevision,
    })),
  };
}
