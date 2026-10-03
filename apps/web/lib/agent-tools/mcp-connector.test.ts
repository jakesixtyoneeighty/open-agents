import { afterEach, expect, mock, test } from "bun:test";

let owner = "owner";
let chatSession = "session";
mock.module("@/lib/db/sessions", () => ({
  getSessionById: async () => ({ id: "session", userId: owner }),
  getChatById: async () => ({ id: "chat", sessionId: chatSession }),
}));
const { mcpConnectorTool } = await import("./mcp-connector");
const original = process.env.OPEN_AGENTS_MCP_CONNECTORS;
afterEach(() => {
  if (original === undefined) delete process.env.OPEN_AGENTS_MCP_CONNECTORS;
  else process.env.OPEN_AGENTS_MCP_CONNECTORS = original;
  owner = "owner";
  chatSession = "session";
});
const options = {
  toolCallId: "test",
  messages: [],
  experimental_context: {
    connectorScope: { userId: "owner", sessionId: "session", chatId: "chat" },
  },
};

test("connector tool reports no configuration and rechecks live ownership on every call", async () => {
  process.env.OPEN_AGENTS_MCP_CONNECTORS = "[]";
  const first = await mcpConnectorTool.execute?.({ action: "list" }, options);
  expect(first).toMatchObject({
    success: true,
    availability: "not_configured",
    connectors: [],
  });
  owner = "different-owner";
  expect(
    await mcpConnectorTool.execute?.({ action: "list" }, options),
  ).toMatchObject({ success: false, availability: "unavailable" });
  owner = "owner";
  chatSession = "foreign-session";
  expect(
    await mcpConnectorTool.execute?.({ action: "list" }, options),
  ).toMatchObject({ success: false });
  expect(
    await mcpConnectorTool.execute?.(
      { action: "list" },
      { ...options, experimental_context: {} },
    ),
  ).toMatchObject({ success: false });
});

test("configuration and credentials are never reflected; calls always need approval", async () => {
  process.env.OPEN_AGENTS_MCP_CONNECTORS = "private malformed configuration";
  const result = await mcpConnectorTool.execute?.({ action: "list" }, options);
  expect(result).toMatchObject({ success: false });
  expect(JSON.stringify(result)).not.toContain("private malformed");
  expect(typeof mcpConnectorTool.needsApproval).toBe("function");
  if (typeof mcpConnectorTool.needsApproval === "function") {
    expect(
      await mcpConnectorTool.needsApproval(
        {
          action: "call",
          connectorId: "docs",
          toolName: "read",
          arguments: {},
        },
        options,
      ),
    ).toBe(true);
    expect(
      await mcpConnectorTool.needsApproval({ action: "list" }, options),
    ).toBe(false);
  }
});
