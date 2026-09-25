import {
  requireAuthenticatedUser,
  requireOwnedSession,
} from "@/app/api/sessions/_lib/session-context";
import { screenshotResponse } from "@/lib/screenshots/response";

type RouteContext = {
  params: Promise<{ sessionId: string; imageId: string }>;
};

/**
 * GET /api/sessions/:sessionId/screenshots/:imageId
 * Serves a stored subagent screenshot to the session owner.
 */
export async function GET(_req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { sessionId, imageId } = await context.params;
  const sessionContext = await requireOwnedSession({
    userId: authResult.userId,
    sessionId,
  });
  if (!sessionContext.ok) {
    return sessionContext.response;
  }

  return screenshotResponse(sessionId, imageId);
}
