import { createHash } from "node:crypto";
import { z } from "zod";
import { getChatsBySessionId } from "@/lib/db/sessions";
import { computeAndCacheDiff } from "@/lib/diff/compute-diff";
import type {
  CheckpointErrorResponse,
  CheckpointRestoreResponse,
} from "@/lib/checkpoints/types";
import {
  withCheckpointSandbox,
  type CheckpointRouteContext,
} from "../_lib/checkpoint-context";

const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
const restoreRequestSchema = z.object({
  changeSetId: revisionSchema,
  scope: z.enum(["change", "checkpoint"]),
  requestId: z.uuid(),
  dryRun: z.boolean().optional(),
  expectedRevisions: z
    .record(z.string().min(1).max(4096), revisionSchema.nullable())
    .optional(),
});

/**
 * Previews (dryRun) or applies a user-driven revert. Applying requires the
 * previewed revisions and is refused while any agent stream runs in the
 * session, so a restore cannot interleave with an agent turn.
 */
export async function POST(req: Request, context: CheckpointRouteContext) {
  const { sessionId } = await context.params;
  const parsed = restoreRequestSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: "Invalid restore request" }, { status: 400 });
  }
  const { changeSetId, scope, requestId, dryRun, expectedRevisions } =
    parsed.data;

  return withCheckpointSandbox(sessionId, async ({ sandbox }) => {
    if (!dryRun) {
      if (!expectedRevisions) {
        return Response.json(
          { error: "Preview the restore before applying it." },
          { status: 400 },
        );
      }
      const chats = await getChatsBySessionId(sessionId);
      if (chats.some((chat) => chat.activeStreamId)) {
        return Response.json(
          {
            error:
              "An agent is still working in this session. Stop it or wait for it to finish before restoring.",
          },
          { status: 409 },
        );
      }
    }

    const result = await sandbox.applyWorkspaceEdit({
      id: createHash("sha256")
        .update(`checkpoint-restore:${sessionId}:${requestId}`)
        .digest("hex"),
      dryRun,
      // The owner confirms this restore in the UI, including dotenv files
      // (whose contents stay hidden in previews).
      allowSensitive: true,
      origin: {
        source: "user",
        toolName: scope === "checkpoint" ? "restore_checkpoint" : "revert",
      },
      revert: { changeSetId, scope, expectedRevisions },
    });
    if (!result.success) {
      const response: CheckpointErrorResponse = {
        error: result.error,
        ...(result.rollbackFailedPaths
          ? { rollbackFailedPaths: result.rollbackFailedPaths }
          : {}),
      };
      return Response.json(response, { status: 409 });
    }

    if (!result.dryRun) {
      await computeAndCacheDiff({ sandbox, sessionId }).catch((error) => {
        console.error("Failed to refresh diff cache after restore:", error);
      });
    }
    const response: CheckpointRestoreResponse = {
      changeSetId: result.changeSetId,
      dryRun: result.dryRun,
      replayed: Boolean(result.replayed),
      reverts: result.reverts ?? [],
      changes: result.changes,
    };
    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
