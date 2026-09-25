import { after } from "next/server";
import {
  requireAuthenticatedUser,
  requireOwnedSessionChat,
} from "@/app/api/sessions/_lib/session-context";
import type { WebAgentUIMessage } from "@/app/types";
import {
  deleteChat,
  getChatMessages,
  getChatsBySessionId,
  setChatClosed,
  updateChat,
} from "@/lib/db/sessions";
import {
  deleteChatScreenshots,
  getChatOnlyScreenshotIds,
} from "@/lib/screenshots/cleanup";

type RouteContext = {
  params: Promise<{ sessionId: string; chatId: string }>;
};

interface UpdateChatRequest {
  title?: string;
  modelId?: string;
  closed?: boolean;
}

export interface ChatRefreshResponse {
  chat: {
    id: string;
    modelId: string | null;
    activeStreamId: string | null;
  };
  isStreaming: boolean;
  messages: WebAgentUIMessage[];
}

export async function GET(_req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { sessionId, chatId } = await context.params;

  const chatContext = await requireOwnedSessionChat({
    userId: authResult.userId,
    sessionId,
    chatId,
  });
  if (!chatContext.ok) {
    return chatContext.response;
  }

  const messages = await getChatMessages(chatId);

  return Response.json({
    chat: {
      id: chatContext.chat.id,
      modelId: chatContext.chat.modelId ?? null,
      activeStreamId: chatContext.chat.activeStreamId,
    },
    isStreaming: chatContext.chat.activeStreamId !== null,
    messages: messages.map((message) => message.parts as WebAgentUIMessage),
  } satisfies ChatRefreshResponse);
}

export async function PATCH(req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { sessionId, chatId } = await context.params;

  const chatContext = await requireOwnedSessionChat({
    userId: authResult.userId,
    sessionId,
    chatId,
  });
  if (!chatContext.ok) {
    return chatContext.response;
  }

  let body: UpdateChatRequest;
  try {
    body = (await req.json()) as UpdateChatRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.closed === "boolean") {
    if (body.closed) {
      const chats = await getChatsBySessionId(sessionId);
      const hasOtherOpenChat = chats.some(
        (chat) => chat.id !== chatId && chat.closedAt === null,
      );
      if (!hasOtherOpenChat) {
        return Response.json(
          { error: "Cannot close the only open chat in a session" },
          { status: 400 },
        );
      }
    }

    const closedChat = await setChatClosed(chatId, body.closed);
    if (!closedChat) {
      return Response.json({ error: "Chat not found" }, { status: 404 });
    }

    return Response.json({ chat: closedChat });
  }

  const nextTitle = body.title?.trim();
  const nextModelId = body.modelId?.trim();

  if (!nextTitle && !nextModelId) {
    return Response.json(
      { error: "At least one field is required" },
      { status: 400 },
    );
  }

  const updatePayload: { title?: string; modelId?: string } = {};
  if (nextTitle) {
    updatePayload.title = nextTitle;
  }
  if (nextModelId) {
    updatePayload.modelId = nextModelId;
  }

  const updatedChat = await updateChat(chatId, updatePayload);
  if (!updatedChat) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  return Response.json({ chat: updatedChat });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { sessionId, chatId } = await context.params;

  const chatContext = await requireOwnedSessionChat({
    userId: authResult.userId,
    sessionId,
    chatId,
  });
  if (!chatContext.ok) {
    return chatContext.response;
  }

  const chats = await getChatsBySessionId(sessionId);
  if (chats.length <= 1) {
    return Response.json(
      { error: "Cannot delete the only chat in a session" },
      { status: 400 },
    );
  }

  const orphanedScreenshotIds = await getChatOnlyScreenshotIds(
    sessionId,
    chatId,
  );
  await deleteChat(chatId);
  if (orphanedScreenshotIds.length > 0) {
    after(() => deleteChatScreenshots(sessionId, orphanedScreenshotIds));
  }
  return Response.json({ success: true });
}
