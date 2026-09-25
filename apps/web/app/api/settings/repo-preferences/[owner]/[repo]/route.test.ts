import { beforeEach, describe, expect, mock, test } from "bun:test";

let currentSession: { user: { id: string } } | null = {
  user: { id: "user-1" },
};

const upsertCalls: Array<Record<string, unknown>> = [];
const deleteCalls: Array<[string, string, string]> = [];
let deleteResult = true;

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => currentSession,
}));

mock.module("@/lib/db/repo-preferences", () => ({
  getRepoPreferences: async (
    userId: string,
    repoOwner: string,
    repoName: string,
  ) => ({ userId, repoOwner, repoName }),
  upsertRepoPreferences: async (params: Record<string, unknown>) => {
    upsertCalls.push(params);
    return { repoOwner: params.repoOwner, repoName: params.repoName };
  },
  deleteRepoPreferences: async (
    userId: string,
    repoOwner: string,
    repoName: string,
  ) => {
    deleteCalls.push([userId, repoOwner, repoName]);
    return deleteResult;
  },
}));

const routeModulePromise = import("./route");

function context(owner = "acme", repo = "web") {
  return { params: Promise.resolve({ owner, repo }) };
}

function putRequest(body: unknown): Request {
  return new Request(
    "http://localhost/api/settings/repo-preferences/acme/web",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const validBody = {
  modelId: "openai/gpt-5",
  skillRefs: [{ source: "acme/skills", skillName: "review" }],
  setupCommand: " pnpm install ",
  checkCommand: "pnpm run ci",
  instructions: "",
};

describe("/api/settings/repo-preferences/[owner]/[repo]", () => {
  beforeEach(() => {
    currentSession = { user: { id: "user-1" } };
    upsertCalls.length = 0;
    deleteCalls.length = 0;
    deleteResult = true;
  });

  test("requires authentication", async () => {
    currentSession = null;
    const { GET, PUT, DELETE } = await routeModulePromise;
    const req = new Request("http://localhost");
    expect((await GET(req, context())).status).toBe(401);
    expect((await PUT(putRequest(validBody), context())).status).toBe(401);
    expect((await DELETE(req, context())).status).toBe(401);
    expect(upsertCalls).toHaveLength(0);
  });

  test("scopes reads and writes to the signed-in user", async () => {
    const { GET, PUT } = await routeModulePromise;
    const getResponse = await GET(new Request("http://localhost"), context());
    expect(await getResponse.json()).toEqual({
      repository: { userId: "user-1", repoOwner: "acme", repoName: "web" },
    });

    const putResponse = await PUT(putRequest(validBody), context());
    expect(putResponse.status).toBe(200);
    expect(upsertCalls).toEqual([
      {
        userId: "user-1",
        repoOwner: "acme",
        repoName: "web",
        settings: {
          modelId: "openai/gpt-5",
          skillRefs: [{ source: "acme/skills", skillName: "review" }],
          setupCommand: "pnpm install",
          checkCommand: "pnpm run ci",
          instructions: null,
        },
      },
    ]);
  });

  test("rejects invalid repositories and bodies", async () => {
    const { PUT } = await routeModulePromise;
    expect((await PUT(putRequest(validBody), context("../x"))).status).toBe(
      400,
    );
    expect(
      (
        await PUT(
          putRequest({ ...validBody, skillRefs: [{ source: "bad" }] }),
          context(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await PUT(
          new Request("http://localhost", { method: "PUT", body: "{" }),
          context(),
        )
      ).status,
    ).toBe(400);
    expect(upsertCalls).toHaveLength(0);
  });

  test("deletes only the user's entry and reports missing ones", async () => {
    const { DELETE } = await routeModulePromise;
    const req = new Request("http://localhost", { method: "DELETE" });
    expect((await DELETE(req, context())).status).toBe(200);
    expect(deleteCalls).toEqual([["user-1", "acme", "web"]]);

    deleteResult = false;
    expect((await DELETE(req, context())).status).toBe(404);
  });
});
