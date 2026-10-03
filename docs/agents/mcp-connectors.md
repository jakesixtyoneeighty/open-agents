# Task-scoped MCP connectors

The web host exposes `mcp_connector` to the main build agent. It is absent from planning, review and child agents. The tool supports `list`, `tools`, and `call` over MCP Streamable HTTP. Every `call` requests approval, including tools described by a remote server as read-only. Tool input contains connector IDs, tool names and arguments, never server URLs, ownership scopes or credentials.

Configure the server-only `OPEN_AGENTS_MCP_CONNECTORS` environment variable as JSON. Each grant must match the authenticated user, session and chat exactly. Use one grant per connector/task and a separate least-privilege token for each intended scope. Duplicate matching grants are disabled. Session ownership and chat membership are checked from the database on every execution. Removing a grant or credential revokes subsequent calls; an already dispatched call may still complete.

```json
[
  {
    "id": "project-docs",
    "label": "Project documentation",
    "url": "https://your-mcp-server.example/mcp",
    "grants": [
      {
        "userId": "the-user-id",
        "sessionId": "the-session-id",
        "chatId": "the-chat-id",
        "tokenEnv": "PROJECT_DOCS_MCP_TOKEN",
        "tools": ["search", "read_document"]
      }
    ]
  }
]
```

Set `PROJECT_DOCS_MCP_TOKEN` through the deployment's secret settings, then redeploy. Neither variable uses a `NEXT_PUBLIC_` prefix. Use the authenticated database user ID and the session/chat IDs from the chat URL. Never paste tokens into a chat or commit them. No database migration is needed. Endpoints must be HTTPS without embedded credentials, query parameters or fragments. Endpoint configuration is administrator-trusted; this is not an arbitrary-URL proxy. Prefer a dedicated MCP credential with access only to the intended external project. The host tool allowlist does not narrow the remote token's own permissions.

`list` returns only connectors granted to the current task. `configured_unverified` means configuration and a credential exist; it does not prove the server is reachable or the token works. `credentials_missing`, `not_configured` and `unavailable` are separate states. `tools` opens a real protocol connection, pages the server catalog, and returns only explicitly allowed, currently advertised tool schemas. Configured tools missing from the server are reported. Nothing is available by default.

Each execution uses a fresh client and closes it afterward. Credentials remain on the web server and are never sent to the sandbox, model context, tool inputs or stored configuration snapshots. Requests only target the exact configured endpoint and reject redirects; OAuth discovery, stdio servers, resource access, prompts and server sampling are not supported. The remote server is still the recipient of the credential and arguments. Error messages are generic and credential values are redacted from returned protocol text. Remote content is untrusted data. Tool arguments/results persist in transcripts and can be exposed when the user shares a chat; do not enter secrets in arguments.

Discovery is bounded to ten pages and 24,000 output characters. Calls have a 40-second overall deadline (20 seconds for `tools/call`), one MiB per HTTP response and 16,000 returned characters with a Unicode-safe truncation flag. Reconnection/retry is disabled. An interrupted dispatched call reports unknown external effects and must be verified remotely before another approved call. This is not an exactly-once external transaction guarantee, including after workflow retries. No external service has been provisioned or connected by adding this implementation.
