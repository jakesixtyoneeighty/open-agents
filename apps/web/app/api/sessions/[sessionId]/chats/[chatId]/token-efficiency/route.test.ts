import { beforeEach, expect, mock, test } from "bun:test";

let signedIn = true;
let owner = "owner";
let chatSession = "session";
const getMessages = mock(async () => []);
mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => (signedIn ? { user: { id: "owner" } } : null),
}));
mock.module("@/lib/db/sessions", () => ({
  getSessionById: async () => ({ id: "session", userId: owner }),
  getChatById: async () => ({ id: "chat", sessionId: chatSession }),
  getChatMessages: getMessages,
}));
const { GET } = await import("./route");
const context = {
  params: Promise.resolve({ sessionId: "session", chatId: "chat" }),
};
beforeEach(() => {
  signedIn = true;
  owner = "owner";
  chatSession = "session";
  getMessages.mockClear();
});

test("requires authentication and session ownership before reading any measurements", async () => {
  signedIn = false;
  expect((await GET(new Request("https://example.com"), context)).status).toBe(
    401,
  );
  signedIn = true;
  owner = "someone-else";
  expect((await GET(new Request("https://example.com"), context)).status).toBe(
    403,
  );
  owner = "owner";
  chatSession = "different-session";
  expect((await GET(new Request("https://example.com"), context)).status).toBe(
    404,
  );
  expect(getMessages).not.toHaveBeenCalled();
});

test("owner gets an uncached content-free report", async () => {
  const response = await GET(new Request("https://example.com"), context);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ version: 1, turns: [] });
  expect(getMessages).toHaveBeenCalledWith("chat");
});
