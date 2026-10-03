import { getChatsBySessionId } from "@/lib/db/sessions";
import type { CheckpointShowResponse } from "@/lib/checkpoints/types";
import { attributeEntry } from "../_lib/attribute-entries";
import { withCheckpointSandbox } from "../_lib/checkpoint-context";

type RouteContext = {
  params: Promise<{ sessionId: string; changeSetId: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { sessionId, changeSetId } = await context.params;
  if (!/^[a-f0-9]{64}$/.test(changeSetId)) {
    return Response.json({ error: "Invalid change set ID" }, { status: 400 });
  }
  return withCheckpointSandbox(sessionId, async ({ sandbox }) => {
    const result = await sandbox.readWorkspaceHistory({
      history: "show",
      changeSetId,
    });
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 404 });
    }
    if (result.history !== "show") {
      return Response.json(
        { error: "Unexpected history result" },
        { status: 502 },
      );
    }
    const chats = await getChatsBySessionId(sessionId);
    const response: CheckpointShowResponse = {
      entry: attributeEntry(result.entry, sessionId, chats),
      changes: result.changes,
    };
    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
