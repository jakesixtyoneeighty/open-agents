import type { WorkspaceHistoryEntry } from "@open-agents/sandbox";
import type { CheckpointEntry } from "@/lib/checkpoints/types";

type ChatTitle = { id: string; title: string };

/**
 * Journals record the host scope `${sessionId}:${chatId}:build|review`, with
 * `:task:<callId>` appended for subagents. Only scopes from this session are
 * attributed; the raw scope is not returned.
 */
export function attributeEntry(
  entry: WorkspaceHistoryEntry,
  sessionId: string,
  chats: ChatTitle[],
): CheckpointEntry {
  const { origin, ...rest } = entry;
  const parts = origin?.scope?.split(":") ?? [];
  const chatId = parts[0] === sessionId ? parts[1] : undefined;
  const chat = chatId ? chats.find((item) => item.id === chatId) : undefined;
  return {
    ...rest,
    source: origin?.source ?? null,
    toolName: origin?.toolName ?? null,
    chat: chat ? { id: chat.id, title: chat.title } : null,
    viaTask: chatId !== undefined && parts.slice(2).includes("task"),
  };
}
