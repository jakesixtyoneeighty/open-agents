import { tool } from "ai";
import { z } from "zod";
import { getSandbox } from "./utils";
import { executeProcess } from "./process-remote";

export const commandOutputTool = tool({
  description:
    "Read a page of stdout or stderr from a previous bash command in this sandbox. Use the returned commandId and nextOffset to recover omitted diagnostics without rerunning the command. Logs may expire after sandbox replacement.",
  inputSchema: z.object({
    commandId: z.string().min(1).max(200),
    stream: z.enum(["stdout", "stderr"]),
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(2).max(16_000).default(8000),
  }),
  execute: async (input, { experimental_context, abortSignal, toolCallId }) => {
    if (input.commandId.startsWith("process:")) {
      const result = await executeProcess(
        {
          action: "logs",
          processId: input.commandId.slice(8),
          stream: input.stream,
          offset: input.offset,
          limit: input.limit,
        },
        experimental_context,
        toolCallId,
        abortSignal,
      );
      return result.log
        ? { success: true, commandId: input.commandId, ...result.log }
        : { success: false, error: result.error ?? "Process log unavailable." };
    }
    const sandbox = await getSandbox(experimental_context, "command_output");
    if (!sandbox.readCommandOutput) {
      return {
        success: false,
        error: "Command log retrieval is unavailable in this sandbox.",
      };
    }
    try {
      const output = await sandbox.readCommandOutput(input.commandId, {
        ...input,
        signal: abortSignal,
      });
      return {
        success: true,
        commandId: input.commandId,
        stream: input.stream,
        ...output,
      };
    } catch {
      return {
        success: false,
        error:
          "Command log is unavailable or expired. Do not rerun commands automatically to recover it.",
      };
    }
  },
});
