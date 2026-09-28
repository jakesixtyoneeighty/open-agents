import {
  requireAuthenticatedUser,
  requireOwnedSessionChat,
} from "@/app/api/sessions/_lib/session-context";
import type { WebAgentUIMessage } from "@/app/types";
import { getChatMessages } from "@/lib/db/sessions";
import { buildTokenEfficiencyReport } from "@/lib/chat/token-efficiency";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ sessionId: string; chatId: string }>;
  },
) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;
  const { sessionId, chatId } = await context.params;
  const owned = await requireOwnedSessionChat({
    userId: auth.userId,
    sessionId,
    chatId,
  });
  if (!owned.ok) return owned.response;
  const messages = await getChatMessages(chatId);
  return Response.json(
    buildTokenEfficiencyReport(
      messages.map((message) => message.parts as WebAgentUIMessage),
    ),
    {
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
