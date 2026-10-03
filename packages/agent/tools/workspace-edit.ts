import { createHash } from "node:crypto";
import type { WorkspaceEditRequest } from "@open-agents/sandbox";
import { tool } from "ai";
import { z } from "zod";
import { getSandbox } from "./utils";
import { parseWorkspacePatch } from "./patch-parser";
import {
  compactWorkspaceEditResult,
  fileRevisionSchema,
  replacementSchema,
  workspaceEditOutputSchema,
  type WorkspaceEditOutput,
} from "./workspace-edit-schema";

export async function executeWorkspaceEdit(
  input:
    | Omit<Extract<WorkspaceEditRequest, { operations: unknown }>, "id">
    | Omit<Extract<WorkspaceEditRequest, { undo: string }>, "id">,
  context: unknown,
  toolCallId: string,
  toolName: string,
): Promise<WorkspaceEditOutput> {
  try {
    const sandbox = await getSandbox(context, toolName);
    if (!sandbox.applyWorkspaceEdit)
      return {
        success: false,
        error: "This sandbox does not support coordinated edits.",
      };
    const id = createHash("sha256")
      .update(`${toolName}:${toolCallId}`)
      .digest("hex");
    return workspaceEditOutputSchema.parse(
      await sandbox.applyWorkspaceEdit({ ...input, id }),
    );
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Edit failed",
    };
  }
}

export const multiEditTool = tool({
  description: `Apply related exact-text edits across 1–25 files as one recoverable change set.
Read each file first and supply its revision. Each file appears once; its edits run in order.
Text replacements are literal. Ambiguous, empty, or missing oldString values fail before any files change.
Use dryRun to preview; it does not reserve file versions. Return changes are grouped in the UI.
Do not modify dotenv files with this tool. Use an approved single-file edit instead.
On a revision conflict, read current content and submit a new call. Use undo_edit with changeSetId only when the user asks to undo this operation.`,
  inputSchema: z.object({
    files: z
      .array(
        z.object({
          filePath: z.string().min(1),
          expectedRevision: fileRevisionSchema.describe(
            "SHA-256 revision returned by read",
          ),
          edits: z.array(replacementSchema).min(1).max(100),
        }),
      )
      .min(1)
      .max(25),
    dryRun: z.boolean().optional(),
  }),
  outputSchema: workspaceEditOutputSchema,
  execute: ({ files, dryRun }, { experimental_context, toolCallId }) =>
    executeWorkspaceEdit(
      {
        operations: files.map(({ filePath, ...file }) => ({
          kind: "update",
          path: filePath,
          ...file,
        })),
        dryRun,
      },
      experimental_context,
      toolCallId,
      "multi_edit",
    ),
  toModelOutput: ({ output }) => ({
    type: "json",
    value: compactWorkspaceEditResult(output),
  }),
});

export const applyPatchTool = tool({
  description: `Apply a strict text patch with create, update, delete, and move operations.
Syntax:
*** Begin Patch
*** Update File: src/example.ts
@@
 unchanged context line
-old line
+new line
*** Add File: src/new.ts
+new file content
*** End Patch
For deletion use *** Delete File: path. For rename put *** Move to: new/path immediately after an Update header.
Supply expectedRevisions for every updated/deleted source file, using revision from read. New destinations must not exist.
Hunks use exact, unique context (no fuzzy matching). Use *** End of File after a hunk to anchor it at EOF.
Existing LF/CRLF style and trailing-newline state are preserved. Added files use LF and a final newline; empty additions create empty files.
Use multi_edit for literal fragments or explicit newline changes. Binary files, symlinks, .git and dotenv paths are unsupported.
All files are checked before writing; return includes changeSetId for user-requested undo.`,
  inputSchema: z.object({
    patch: z
      .string()
      .min(1)
      .max(2 * 1024 * 1024),
    expectedRevisions: z.record(z.string(), fileRevisionSchema),
    dryRun: z.boolean().optional(),
  }),
  outputSchema: workspaceEditOutputSchema,
  execute: async (
    { patch, expectedRevisions, dryRun },
    { experimental_context, toolCallId },
  ) => {
    try {
      return await executeWorkspaceEdit(
        { operations: parseWorkspacePatch(patch, expectedRevisions), dryRun },
        experimental_context,
        toolCallId,
        "apply_patch",
      );
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : "Invalid patch",
      };
    }
  },
  toModelOutput: ({ output }) => ({
    type: "json",
    value: compactWorkspaceEditResult(output),
  }),
});

export const undoEditTool = tool({
  needsApproval: ({ dryRun }) => !dryRun,
  description:
    "Undo one completed edit change set when the user requests it. Restores only its files, and refuses if any affected file has changed since that edit. Unrelated files are preserved. History is retained in this sandbox only and may be unavailable after sandbox replacement. Use dryRun for a preview.",
  inputSchema: z.object({
    changeSetId: fileRevisionSchema,
    dryRun: z.boolean().optional(),
  }),
  outputSchema: workspaceEditOutputSchema,
  execute: ({ changeSetId, dryRun }, { experimental_context, toolCallId }) =>
    executeWorkspaceEdit(
      { undo: changeSetId, dryRun },
      experimental_context,
      toolCallId,
      "undo_edit",
    ),
  toModelOutput: ({ output }) => ({
    type: "json",
    value: compactWorkspaceEditResult(output),
  }),
});
