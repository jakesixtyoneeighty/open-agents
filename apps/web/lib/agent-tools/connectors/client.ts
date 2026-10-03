import { Client } from "@modelcontextprotocol/sdk/client";
// This third-party export requires its .js suffix (unlike workspace imports).
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ScopedConnector } from "./config";

export function boundedText(text: string, limit: number) {
  if (text.length <= limit) return text;
  let end = limit;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  return text.slice(0, end);
}

/** Only the exact configured endpoint receives the credential; redirects/auth discovery are refused. */
export function connectorFetch(
  endpoint: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (new URL(url).href !== new URL(endpoint).href)
      throw new Error("Unconfigured connector endpoint.");
    const response = await fetcher(input, {
      ...init,
      redirect: "error",
      signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]),
    });
    if (!response.body) return response;
    let size = 0;
    const stream = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          size += chunk.byteLength;
          if (size > 1024 * 1024)
            throw new Error("Connector response exceeds 1 MiB.");
          controller.enqueue(chunk);
        },
      }),
    );
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }) as typeof fetch;
}

export async function runConnector(
  connector: ScopedConnector,
  input: {
    action: "tools" | "call";
    toolName?: string;
    arguments?: Record<string, unknown>;
  },
  abortSignal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  if (!connector.token)
    return {
      success: false,
      availability: "credentials_missing",
      error: "This task's connector credential is not configured.",
    };
  if (
    input.action === "call" &&
    (!input.toolName || !connector.tools.includes(input.toolName))
  )
    return {
      success: false,
      availability: "not_allowed",
      error: "Tool is not enabled for this task.",
    };
  const signal = AbortSignal.any([
    AbortSignal.timeout(40_000),
    ...(abortSignal ? [abortSignal] : []),
  ]);
  const client = new Client(
    { name: "open-agents", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(new URL(connector.url), {
    requestInit: { headers: { Authorization: `Bearer ${connector.token}` } },
    fetch: connectorFetch(connector.url, signal, fetcher),
    reconnectionOptions: {
      maxRetries: 0,
      initialReconnectionDelay: 1000,
      maxReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1,
    },
  });
  const redact = (text: string) => {
    const token = connector.token ?? "";
    return text
      .split(JSON.stringify(token).slice(1, -1))
      .join("[credential redacted]")
      .split(token)
      .join("[credential redacted]");
  };
  let dispatched = false;
  try {
    await client.connect(transport, { signal, timeout: 15_000 });
    const tools: Awaited<ReturnType<Client["listTools"]>>["tools"] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const result = await client.listTools(
        { cursor },
        { signal, timeout: 10_000 },
      );
      tools.push(
        ...result.tools.filter((item) => connector.tools.includes(item.name)),
      );
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    if (cursor)
      return {
        success: false,
        availability: "unavailable",
        error:
          "Tool discovery exceeded its page limit. Narrow the server's catalog.",
      };
    if (input.action === "tools") {
      const text = redact(
        JSON.stringify(
          tools.map(({ name, description, inputSchema }) => ({
            name,
            description,
            inputSchema,
          })),
        ),
      );
      if (text.length > 24_000)
        return {
          success: false,
          availability: "unavailable",
          error:
            "Allowed tool schemas exceed the discovery budget; narrow the configured tools.",
        };
      return {
        success: true,
        availability: "connected",
        text,
        missingTools: connector.tools.filter(
          (name) => !tools.some((item) => item.name === name),
        ),
      };
    }
    if (!tools.some((item) => item.name === input.toolName))
      return {
        success: false,
        availability: "unavailable",
        error: "The server does not currently advertise this allowed tool.",
      };
    dispatched = true;
    const result = await client.callTool(
      { name: input.toolName ?? "", arguments: input.arguments ?? {} },
      undefined,
      { signal, timeout: 20_000 },
    );
    const text = redact(JSON.stringify(result));
    return {
      success: result.isError !== true,
      availability: "connected",
      text: boundedText(text, 16_000),
      truncated: text.length > 16_000,
      ...(result.isError === true
        ? { error: "The remote tool reported an error." }
        : {}),
    };
  } catch {
    // Never expose SDK errors: they may contain a URL, headers, token, or response body.
    return {
      success: false,
      availability: "unavailable",
      outcomeUnknown: dispatched,
      error: dispatched
        ? "Connector call interrupted or failed; external effects may have occurred. Verify remotely before requesting another call."
        : "Could not connect or discover tools. Check the scoped credential and server availability.",
    };
  } finally {
    await client.close().catch(() => {});
  }
}
