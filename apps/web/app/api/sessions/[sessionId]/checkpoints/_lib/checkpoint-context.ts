import { connectSandbox, type Sandbox } from "@open-agents/sandbox";
import {
  requireAuthenticatedUser,
  requireOwnedSessionWithSandboxGuard,
  type SessionRecord,
} from "@/app/api/sessions/_lib/session-context";
import { updateSession } from "@/lib/db/sessions";
import { buildHibernatedLifecycleUpdate } from "@/lib/sandbox/lifecycle";
import {
  clearUnavailableSandboxState,
  hasRuntimeSandboxState,
  isSandboxUnavailableError,
} from "@/lib/sandbox/utils";

type CheckpointSandbox = Sandbox &
  Required<Pick<Sandbox, "applyWorkspaceEdit" | "readWorkspaceHistory">>;

export type CheckpointRouteContext = {
  params: Promise<{ sessionId: string }>;
};

/**
 * Owner-only access to the session's sandbox for history routes. History
 * lives in the sandbox filesystem, so a paused or missing sandbox is reported
 * explicitly rather than as an empty history.
 */
export async function withCheckpointSandbox(
  sessionId: string,
  run: (params: {
    sandbox: CheckpointSandbox;
    sessionRecord: SessionRecord;
  }) => Promise<Response>,
): Promise<Response> {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) return authResult.response;

  const sessionContext = await requireOwnedSessionWithSandboxGuard({
    userId: authResult.userId,
    sessionId,
    sandboxGuard: hasRuntimeSandboxState,
    sandboxErrorMessage:
      "Sandbox is not running. Resume it to load change history.",
    sandboxErrorStatus: 409,
  });
  if (!sessionContext.ok) return sessionContext.response;

  const { sessionRecord } = sessionContext;
  if (!sessionRecord.sandboxState) {
    return Response.json(
      { error: "Sandbox is not running. Resume it to load change history." },
      { status: 409 },
    );
  }

  try {
    const sandbox = await connectSandbox(sessionRecord.sandboxState);
    if (!sandbox.readWorkspaceHistory || !sandbox.applyWorkspaceEdit) {
      return Response.json(
        { error: "This sandbox does not record change history." },
        { status: 501 },
      );
    }
    return await run({
      sandbox: sandbox as CheckpointSandbox,
      sessionRecord,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isSandboxUnavailableError(message)) {
      await updateSession(sessionId, {
        sandboxState: clearUnavailableSandboxState(
          sessionRecord.sandboxState,
          message,
        ),
        ...buildHibernatedLifecycleUpdate(),
      });
      return Response.json(
        { error: "Sandbox is unavailable. Resume it to load change history." },
        { status: 409 },
      );
    }
    console.error("Checkpoint history request failed:", error);
    return Response.json(
      { error: "Change history request failed" },
      { status: 500 },
    );
  }
}
