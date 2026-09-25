import type { WebAgentUIMessage } from "@/app/types";
import { taskBriefSubmissionSchema } from "@/lib/task-brief";

export interface ChatRequestBody {
  messages: WebAgentUIMessage[];
  sessionId?: string;
  chatId?: string;
}

type ParseChatRequestResult =
  | {
      ok: true;
      body: ChatRequestBody;
    }
  | {
      ok: false;
      response: Response;
    };

type RequireChatIdentifiersResult =
  | {
      ok: true;
      sessionId: string;
      chatId: string;
    }
  | {
      ok: false;
      response: Response;
    };

export async function parseChatRequestBody(
  req: Request,
): Promise<ParseChatRequestResult> {
  try {
    const body = (await req.json()) as ChatRequestBody;
    if (!Array.isArray(body?.messages)) {
      return {
        ok: false,
        response: Response.json(
          { error: "Messages are required" },
          { status: 400 },
        ),
      };
    }
    for (const message of body.messages) {
      if (!message || !Array.isArray(message.parts)) {
        return {
          ok: false,
          response: Response.json(
            { error: "Invalid message" },
            { status: 400 },
          ),
        };
      }
      let briefCount = 0;
      for (const part of message.parts) {
        if (part?.type !== "data-task-brief") continue;
        briefCount++;
        const parsed = taskBriefSubmissionSchema.safeParse(part.data);
        if (message.role !== "user" || briefCount > 1 || !parsed.success) {
          return {
            ok: false,
            response: Response.json(
              { error: "Invalid task brief" },
              { status: 400 },
            ),
          };
        }
        part.data = parsed.data;
      }
    }
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }
}

export function requireChatIdentifiers(
  body: ChatRequestBody,
): RequireChatIdentifiersResult {
  if (!body.sessionId || !body.chatId) {
    return {
      ok: false,
      response: Response.json(
        { error: "sessionId and chatId are required" },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true,
    sessionId: body.sessionId,
    chatId: body.chatId,
  };
}
