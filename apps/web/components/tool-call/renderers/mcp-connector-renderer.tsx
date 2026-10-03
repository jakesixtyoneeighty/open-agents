"use client";

import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";

export function McpConnectorRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<"tool-mcp_connector">) {
  const result = part.state === "output-available" ? part.output : undefined;
  const error = result && "error" in result ? result.error : undefined;
  const label = result?.availability.replaceAll("_", " ");
  const approvalDetails =
    state.approvalRequested && part.input?.action === "call" ? (
      <div className="max-h-64 overflow-auto rounded-md border border-border p-3 text-xs">
        <p>External tool: {part.input.toolName}</p>
        <pre className="whitespace-pre-wrap break-words">
          {JSON.stringify(part.input.arguments, null, 2)}
        </pre>
      </div>
    ) : undefined;
  return (
    <ToolLayout
      name="MCP connector"
      summary={
        part.input?.action === "list"
          ? "Task integrations"
          : part.input && "connectorId" in part.input
            ? `${part.input.connectorId}${part.input.action === "call" ? ` · ${part.input.toolName}` : ""}`
            : ""
      }
      meta={result?.success ? label : undefined}
      state={
        result?.success === false
          ? { ...state, error: error ?? "Connector unavailable" }
          : state
      }
      errorMeta={label}
      onApprove={onApprove}
      onDeny={onDeny}
      expandedContent={
        result ? (
          <div className="max-h-96 space-y-2 overflow-auto rounded-md border border-border p-3 text-xs">
            <p>{label}</p>
            {"connectors" in result &&
              result.connectors?.map((connector) => (
                <p key={connector.id}>
                  {connector.label} ({connector.id}) ·{" "}
                  {connector.availability.replaceAll("_", " ")}
                </p>
              ))}
            {"text" in result && result.text && (
              <pre className="whitespace-pre-wrap break-words">
                {result.text}
              </pre>
            )}
            {"truncated" in result && result.truncated && (
              <p>Response truncated.</p>
            )}
            {"missingTools" in result && !!result.missingTools?.length && (
              <p>
                Not advertised by the server: {result.missingTools.join(", ")}
              </p>
            )}
            {"outcomeUnknown" in result && result.outcomeUnknown && (
              <p>External effects are unknown. Verify before retrying.</p>
            )}
            {error && <p>{error}</p>}
          </div>
        ) : undefined
      }
    >
      {approvalDetails}
    </ToolLayout>
  );
}
