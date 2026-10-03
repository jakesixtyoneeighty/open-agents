import { z } from "zod";

export const connectorScopeSchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  chatId: z.string().min(1),
});
export type ConnectorScope = z.infer<typeof connectorScopeSchema>;
const grantSchema = connectorScopeSchema.extend({
  tokenEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  tools: z.array(z.string().min(1).max(128)).min(1).max(50),
});
const configSchema = z
  .array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]{1,60}$/),
      label: z.string().min(1).max(100),
      url: z
        .string()
        .url()
        .refine((value) => {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash
          );
        }, "Use an HTTPS endpoint without credentials, query or fragment"),
      grants: z.array(grantSchema).min(1).max(100),
    }),
  )
  .max(25)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
  );

/** Deployment-owned config only. Never parse endpoints, credentials or scopes from tool input. */
export function resolveConnectorConfig(
  scope: ConnectorScope,
  env: Record<string, string | undefined> = process.env,
) {
  const parsed = configSchema.safeParse(
    JSON.parse(env.OPEN_AGENTS_MCP_CONNECTORS ?? "[]"),
  );
  if (!parsed.success) throw new Error("Connector configuration is invalid.");
  return parsed.data.flatMap((config) => {
    const grants = config.grants.filter(
      (grant) =>
        grant.userId === scope.userId &&
        grant.sessionId === scope.sessionId &&
        grant.chatId === scope.chatId,
    );
    if (grants.length !== 1) return []; // Ambiguous grants fail closed too.
    const grant = grants[0];
    if (!grant) return [];
    return [
      {
        id: config.id,
        label: config.label,
        url: config.url,
        tools: grant.tools,
        token: env[grant.tokenEnv],
      },
    ];
  });
}
export type ScopedConnector = ReturnType<typeof resolveConnectorConfig>[number];
