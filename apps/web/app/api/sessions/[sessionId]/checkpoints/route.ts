import { getChatsBySessionId } from "@/lib/db/sessions";
import type { CheckpointListResponse } from "@/lib/checkpoints/types";
import { attributeEntry } from "./_lib/attribute-entries";
import {
  withCheckpointSandbox,
  type CheckpointRouteContext,
} from "./_lib/checkpoint-context";

export async function GET(_req: Request, context: CheckpointRouteContext) {
  const { sessionId } = await context.params;
  return withCheckpointSandbox(sessionId, async ({ sandbox }) => {
    const result = await sandbox.readWorkspaceHistory({ history: "list" });
    if (!result.success || result.history !== "list") {
      return Response.json(
        { error: result.success ? "Unexpected history result" : result.error },
        { status: 502 },
      );
    }
    const chats = await getChatsBySessionId(sessionId);
    const response: CheckpointListResponse = {
      entries: result.entries.map((entry) =>
        attributeEntry(entry, sessionId, chats),
      ),
      retention: result.retention,
      recoveryRequired: result.recoveryRequired,
    };
    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
