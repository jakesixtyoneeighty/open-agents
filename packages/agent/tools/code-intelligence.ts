import { tool } from "ai";
import {
  codeInspectSchema,
  codeRenameSchema,
  intelligenceResultSchema,
} from "./intelligence/schema";
import { queryIntelligence } from "./intelligence/remote";
import { getSandbox } from "./utils";
import { getBrowserScope } from "./browser";
import { executeWorkspaceEdit } from "./workspace-edit";
import {
  compactWorkspaceEditResult,
  workspaceEditOutputSchema,
} from "./workspace-edit-schema";

export const codeInspectTool = tool({
  description: `Inspect TypeScript/JavaScript file symbols, definitions or references using the TypeScript language service. Positions are 1-based UTF-16. Requires tsconfig.json/jsconfig.json and git. Results describe the configured project only, with a working-tree revision; omitted/dependency results and truncation are explicit. Unsupported languages/configurations report unavailable; use grep/read instead. No project plugins execute. For symbols, use line=1,column=1.`,
  inputSchema: codeInspectSchema,
  outputSchema: intelligenceResultSchema.omit({
    operations: true,
    readRevisions: true,
  }),
  execute: async (input, { experimental_context, abortSignal }) => {
    try {
      const sandbox = await getSandbox(experimental_context, "code_inspect");
      const {
        operations: _operations,
        readRevisions: _readRevisions,
        ...result
      } = await queryIntelligence(sandbox, input, false, abortSignal);
      return result;
    } catch {
      return {
        success: false,
        availability: "unavailable" as const,
        revision: null,
        engine: "TypeScript 5.9.3 language service",
        error:
          "Language service setup or transport failed. Use read/grep or retry after checking project configuration.",
      };
    }
  },
});

export const codeRenameTool = tool({
  description: `Semantically rename a TS/JS symbol within its configured project, preserving aliases and shorthand properties. Inspect first and pass that workspace revision. Defaults to dryRun preview. Set dryRun=false to apply through the shared edit engine with grouped diffs, stale-revision checks and undo history. Never falls back to text replacement or partial rename. Project references and external/dependency edits are refused. Search for consumers outside this project before renaming; those are outside this tool's scope. Then run_checks.`,
  inputSchema: codeRenameSchema,
  outputSchema: workspaceEditOutputSchema,
  execute: async (input, { experimental_context, toolCallId, abortSignal }) => {
    try {
      const sandbox = await getSandbox(experimental_context, "code_rename");
      const scope = getBrowserScope(experimental_context);
      if (!scope)
        return {
          success: false as const,
          error: "Semantic rename requires a host chat/task scope.",
        };
      const result = await queryIntelligence(
        sandbox,
        input,
        true,
        abortSignal,
        `${scope}:${toolCallId}`,
      );
      if (!result.success || !result.operations?.length || !result.revision)
        return {
          success: false as const,
          error: result.error ?? "Semantic rename unavailable.",
        };
      return await executeWorkspaceEdit(
        {
          operations: result.operations,
          expectedWorkspaceRevision: result.revision,
          readRevisions: result.readRevisions,
          dryRun: input.dryRun,
        },
        experimental_context,
        toolCallId,
        "code_rename",
      );
    } catch {
      return {
        success: false as const,
        error:
          "Semantic rename interrupted or unavailable. Retry this same call to recover a saved plan; do not assume files changed.",
      };
    }
  },
  toModelOutput: ({ output }) => ({
    type: "json",
    value: compactWorkspaceEditResult(output),
  }),
});
