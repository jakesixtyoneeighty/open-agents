import type { ModelMessage } from "ai";
import {
  workspaceEditOutputSchema,
  type WorkspaceEditOutput,
} from "./workspace-edit-schema";

/** Keep full subagent diffs for the transcript, without expanding model context. */
export function createWorkspaceEditHistory() {
  const results = new Map<string, WorkspaceEditOutput>();
  return {
    capture(part: { toolName: string; toolCallId: string; output: unknown }) {
      if (!["multi_edit", "apply_patch", "undo_edit"].includes(part.toolName))
        return;
      const parsed = workspaceEditOutputSchema.safeParse(part.output);
      if (parsed.success) results.set(part.toolCallId, parsed.data);
    },
    restore(messages: ModelMessage[]): ModelMessage[] {
      return messages.map((message) =>
        message.role !== "tool"
          ? message
          : {
              ...message,
              content: message.content.map((part) => {
                if (part.type !== "tool-result") return part;
                const result = results.get(part.toolCallId);
                return result
                  ? {
                      ...part,
                      output: { type: "json" as const, value: result },
                    }
                  : part;
              }),
            },
      );
    },
  };
}
