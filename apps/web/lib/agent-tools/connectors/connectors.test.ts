import { expect, test } from "bun:test";
import { resolveConnectorConfig, type ScopedConnector } from "./config";
import { boundedText, connectorFetch, runConnector } from "./client";

const scope = { userId: "user", sessionId: "session", chatId: "chat" };
const connector: ScopedConnector = {
  id: "docs",
  label: "Docs",
  url: "https://mcp.example.test/mcp",
  tools: ["search"],
  token: "secret-test-token",
};
const config = [
  {
    id: connector.id,
    label: connector.label,
    url: connector.url,
    grants: [{ ...scope, tokenEnv: "DOCS_TOKEN", tools: ["search"] }],
  },
];

test("credentials and tool grants require the exact user, session and task; duplicates fail closed", () => {
  const env = {
    OPEN_AGENTS_MCP_CONNECTORS: JSON.stringify(config),
    DOCS_TOKEN: connector.token,
  };
  expect(resolveConnectorConfig(scope, env)).toEqual([connector]);
  for (const key of ["userId", "sessionId", "chatId"])
    expect(resolveConnectorConfig({ ...scope, [key]: "foreign" }, env)).toEqual(
      [],
    );
  expect(resolveConnectorConfig(scope, {})).toEqual([]);
  expect(
    resolveConnectorConfig(scope, {
      OPEN_AGENTS_MCP_CONNECTORS: env.OPEN_AGENTS_MCP_CONNECTORS,
    })[0]?.token,
  ).toBeUndefined();
  expect(() =>
    resolveConnectorConfig(scope, {
      OPEN_AGENTS_MCP_CONNECTORS: JSON.stringify([
        { ...config[0], url: "http://localhost" },
      ]),
    }),
  ).toThrow();
  expect(
    resolveConnectorConfig(scope, {
      OPEN_AGENTS_MCP_CONNECTORS: JSON.stringify([
        {
          ...config[0],
          grants: [...(config[0]?.grants ?? []), ...(config[0]?.grants ?? [])],
        },
      ]),
    }),
  ).toEqual([]);
});

function wire(
  options: { failCall?: boolean; toolError?: boolean; missing?: boolean } = {},
) {
  const methods: string[] = [];
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      `Bearer ${connector.token}`,
    );
    if (init?.method === "GET") return new Response(null, { status: 405 });
    const request = JSON.parse(String(init?.body)) as {
      id?: string | number;
      method: string;
    };
    methods.push(request.method);
    if (request.id === undefined) return new Response(null, { status: 202 });
    if (request.method === "tools/call" && options.failCall)
      throw new Error(`upstream echoed ${connector.token}`);
    const result =
      request.method === "initialize"
        ? {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: { name: "fixture", version: "1" },
          }
        : request.method === "tools/list"
          ? {
              tools: [
                ...(!options.missing
                  ? [
                      {
                        name: "search",
                        description: `Search ${connector.token}`,
                        inputSchema: { type: "object" },
                      },
                    ]
                  : []),
                { name: "delete_everything", inputSchema: { type: "object" } },
              ],
            }
          : {
              content: [{ type: "text", text: `Found ${connector.token}` }],
              isError: options.toolError ?? false,
            };
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: request.id, result }),
      { headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  return { fetcher, methods };
}

test("real MCP client initializes, discovers only allowed tools, calls once and redacts credentials", async () => {
  const fixture = wire();
  const discovery = await runConnector(
    connector,
    { action: "tools" },
    undefined,
    fixture.fetcher,
  );
  expect(discovery.success).toBe(true);
  expect(discovery.text).toContain("search");
  expect(discovery.text).not.toContain("delete_everything");
  expect(discovery.text).not.toContain(connector.token ?? "secret");
  const call = await runConnector(
    connector,
    { action: "call", toolName: "search", arguments: { query: "hello" } },
    undefined,
    fixture.fetcher,
  );
  expect(call.success).toBe(true);
  expect(call.text).toContain("[credential redacted]");
  expect(
    fixture.methods.filter((method) => method === "tools/call"),
  ).toHaveLength(1);
});

test("missing credentials, disallowed tools, missing advertised tools and network failures are truthful", async () => {
  const fixture = wire({ missing: true });
  expect(
    (
      await runConnector(
        { ...connector, token: undefined },
        { action: "tools" },
        undefined,
        fixture.fetcher,
      )
    ).availability,
  ).toBe("credentials_missing");
  expect(
    (
      await runConnector(
        connector,
        { action: "call", toolName: "delete_everything" },
        undefined,
        fixture.fetcher,
      )
    ).availability,
  ).toBe("not_allowed");
  expect(fixture.methods).toEqual([]);
  expect(
    (
      await runConnector(
        connector,
        { action: "call", toolName: "search" },
        undefined,
        fixture.fetcher,
      )
    ).success,
  ).toBe(false);
  expect(fixture.methods).not.toContain("tools/call");
  const failing = wire({ failCall: true });
  const failure = await runConnector(
    connector,
    { action: "call", toolName: "search" },
    undefined,
    failing.fetcher,
  );
  expect(failure.outcomeUnknown).toBe(true);
  expect(JSON.stringify(failure)).not.toContain(connector.token ?? "secret");
  expect(
    failing.methods.filter((method) => method === "tools/call"),
  ).toHaveLength(1);
  const toolFailure = await runConnector(
    connector,
    { action: "call", toolName: "search" },
    undefined,
    wire({ toolError: true }).fetcher,
  );
  expect(toolFailure.success).toBe(false);
  expect(toolFailure.availability).toBe("connected");
});

test("transport rejects alternate endpoints and bounds streams and Unicode output", async () => {
  let count = 0;
  const fetcher = (async () => {
    count++;
    return new Response("x".repeat(1024 * 1024 + 1));
  }) as unknown as typeof fetch;
  const transport = connectorFetch(
    connector.url,
    AbortSignal.timeout(1000),
    fetcher,
  );
  await expect(transport("https://other.example/mcp")).rejects.toThrow();
  expect(count).toBe(0);
  const result = await transport(connector.url);
  await expect(result.text()).rejects.toThrow("1 MiB");
  expect(boundedText("ab😀c", 3)).toBe("ab");
});
