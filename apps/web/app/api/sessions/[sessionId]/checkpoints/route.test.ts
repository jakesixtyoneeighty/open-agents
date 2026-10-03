import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

type SandboxState = { type: string; sandboxId?: string } | null;
type OwnedSessionResult =
  | {
      ok: true;
      sessionRecord: { id: string; userId: string; sandboxState: SandboxState };
    }
  | { ok: false; response: Response };

const editRequests: Record<string, unknown>[] = [];
const diffRefreshes: string[] = [];
let ownedSessionResult: OwnedSessionResult;
let chats: { id: string; title: string; activeStreamId: string | null }[];
let editResult: Record<string, unknown>;

const entry = {
  changeSetId: "a".repeat(64),
  committedAt: 1,
  status: "active",
  files: [{ path: "a.ts", kind: "updated", additions: 1, deletions: 1 }],
};

mock.module("@/app/api/sessions/_lib/session-context", () => ({
  requireAuthenticatedUser: async () => ({ ok: true, userId: "user-1" }),
  requireOwnedSessionWithSandboxGuard: async () => ownedSessionResult,
}));

mock.module("@open-agents/sandbox", () => ({
  connectSandbox: async () => ({
    workingDirectory: "/workspace",
    applyWorkspaceEdit: async (request: Record<string, unknown>) => {
      editRequests.push(request);
      return editResult;
    },
    readWorkspaceHistory: async () => ({
      success: true,
      history: "list",
      entries: [
        {
          ...entry,
          origin: {
            source: "agent",
            toolName: "multi_edit",
            scope: "session-1:chat-1:build:task:call-9",
          },
        },
        {
          ...entry,
          changeSetId: "b".repeat(64),
          origin: {
            source: "agent",
            toolName: "edit",
            scope: "other-session:chat-1:build",
          },
        },
        { ...entry, changeSetId: "c".repeat(64), origin: null },
      ],
      retention: {
        maxEntries: 200,
        maxBytes: 64,
        entries: 3,
        bytes: 3,
        pruned: 0,
      },
      recoveryRequired: [],
    }),
  }),
}));

mock.module("@/lib/db/sessions", () => ({
  getChatsBySessionId: async () => chats,
  updateSession: async () => {},
}));

mock.module("@/lib/diff/compute-diff", () => ({
  computeAndCacheDiff: async ({ sessionId }: { sessionId: string }) => {
    diffRefreshes.push(sessionId);
  },
}));

mock.module("@/lib/sandbox/lifecycle", () => ({
  buildHibernatedLifecycleUpdate: () => ({}),
}));

const restoreRoute = await import("./restore/route");
const listRoute = await import("./route");

const context = { params: Promise.resolve({ sessionId: "session-1" }) };
const requestId = "8f2c3e1a-4b5d-4c6e-9f70-1a2b3c4d5e6f";
const post = (body: unknown) =>
  restoreRoute.POST(
    new Request("http://localhost/api/sessions/session-1/checkpoints/restore", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    context,
  );

beforeEach(() => {
  editRequests.length = 0;
  diffRefreshes.length = 0;
  ownedSessionResult = {
    ok: true,
    sessionRecord: {
      id: "session-1",
      userId: "user-1",
      sandboxState: { type: "vercel", sandboxId: "sbx-1" },
    },
  };
  chats = [{ id: "chat-1", title: "Fix login", activeStreamId: null }];
  editResult = {
    success: true,
    changeSetId: "d".repeat(64),
    dryRun: true,
    replacements: 0,
    changes: [],
  };
});

describe("checkpoint routes", () => {
  test("list attributes entries to chats in this session only", async () => {
    const response = await listRoute.GET(
      new Request("http://localhost"),
      context,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      body.entries.map(
        (item: {
          chat: unknown;
          viaTask: boolean;
          toolName: string | null;
        }) => [item.chat, item.viaTask, item.toolName],
      ),
    ).toEqual([
      [{ id: "chat-1", title: "Fix login" }, true, "multi_edit"],
      [null, false, "edit"],
      [null, false, null],
    ]);
    expect(JSON.stringify(body)).not.toContain("scope");
  });

  test("paused sandboxes are reported instead of an empty history", async () => {
    ownedSessionResult = {
      ok: false,
      response: Response.json(
        { error: "Sandbox is not running." },
        { status: 409 },
      ),
    };
    expect(
      (await listRoute.GET(new Request("http://localhost"), context)).status,
    ).toBe(409);
  });

  test("preview derives a stable request id and records user attribution", async () => {
    const response = await post({
      changeSetId: "a".repeat(64),
      scope: "checkpoint",
      requestId,
      dryRun: true,
    });
    expect(response.status).toBe(200);
    expect(editRequests[0]).toMatchObject({
      dryRun: true,
      allowSensitive: true,
      origin: { source: "user", toolName: "restore_checkpoint" },
      revert: { changeSetId: "a".repeat(64), scope: "checkpoint" },
    });
    await post({
      changeSetId: "a".repeat(64),
      scope: "checkpoint",
      requestId,
      dryRun: true,
    });
    expect(editRequests[1]?.id).toBe(editRequests[0]?.id);
    expect(diffRefreshes).toEqual([]);
  });

  test("apply requires previewed revisions and no running agent", async () => {
    const body = { changeSetId: "a".repeat(64), scope: "change", requestId };
    expect((await post(body)).status).toBe(400);
    expect((await post({ ...body, requestId: "not-a-uuid" })).status).toBe(400);

    chats = [{ id: "chat-1", title: "Fix login", activeStreamId: "stream-1" }];
    const busy = await post({
      ...body,
      expectedRevisions: { "a.ts": "e".repeat(64) },
    });
    expect(busy.status).toBe(409);
    expect(editRequests).toHaveLength(0);

    chats = [{ id: "chat-1", title: "Fix login", activeStreamId: null }];
    editResult = { ...editResult, dryRun: false };
    const applied = await post({
      ...body,
      expectedRevisions: { "a.ts": "e".repeat(64), "gone.ts": null },
    });
    expect(applied.status).toBe(200);
    expect(editRequests[0]).toMatchObject({
      revert: {
        expectedRevisions: { "a.ts": "e".repeat(64), "gone.ts": null },
      },
      origin: { toolName: "revert" },
    });
    expect(diffRefreshes).toEqual(["session-1"]);
  });

  test("worker refusals surface as conflicts with recovery details", async () => {
    editResult = {
      success: false,
      error: "Restore has conflicts and was not applied: a.ts",
      rollbackFailedPaths: ["a.ts"],
    };
    const response = await post({
      changeSetId: "a".repeat(64),
      scope: "change",
      requestId,
      expectedRevisions: {},
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Restore has conflicts and was not applied: a.ts",
      rollbackFailedPaths: ["a.ts"],
    });
  });
});
