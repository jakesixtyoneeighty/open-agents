import { getChatMessages, getChatsBySessionId } from "@/lib/db/sessions";
import { collectScreenshotImageIds } from "./image-id";
import { deleteScreenshots, deleteSessionScreenshots } from "./storage";

async function collectChatImageIds(chatId: string): Promise<Set<string>> {
  const messages = await getChatMessages(chatId);
  return collectScreenshotImageIds(messages.map((message) => message.parts));
}

/**
 * Resolve which screenshots only the given chat references. Forks copy
 * messages within a session, so images still referenced elsewhere are kept.
 * Call before deleting the chat.
 */
export async function getChatOnlyScreenshotIds(
  sessionId: string,
  chatId: string,
): Promise<string[]> {
  const chatImageIds = await collectChatImageIds(chatId);
  if (chatImageIds.size === 0) {
    return [];
  }

  const otherChats = (await getChatsBySessionId(sessionId)).filter(
    (chat) => chat.id !== chatId,
  );
  for (const otherChat of otherChats) {
    for (const imageId of await collectChatImageIds(otherChat.id)) {
      chatImageIds.delete(imageId);
    }
  }
  return [...chatImageIds];
}

export async function deleteChatScreenshots(
  sessionId: string,
  imageIds: string[],
): Promise<void> {
  try {
    await deleteScreenshots(sessionId, imageIds);
  } catch (error) {
    console.error("[Screenshots] Failed to delete chat screenshots:", error);
  }
}

export async function deleteAllSessionScreenshots(
  sessionId: string,
): Promise<void> {
  try {
    await deleteSessionScreenshots(sessionId);
  } catch (error) {
    console.error("[Screenshots] Failed to delete session screenshots:", error);
  }
}
