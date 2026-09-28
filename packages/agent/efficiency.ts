import type { LanguageModelUsage } from "ai";
import { z } from "zod";

const count = z.number().finite().nonnegative().nullable();
export const efficiencyMetricsSchema = z.object({
  version: z.literal(1),
  steps: z.number().int().nonnegative().nullable(),
  inputTokens: count,
  cacheReadTokens: count,
  cacheWriteTokens: count,
  outputTokens: count,
  reasoningTokens: count,
  costUsd: count,
  durationMs: count,
});
export type EfficiencyMetrics = z.infer<typeof efficiencyMetricsSchema>;

function measured(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/** Only numeric provider measurements; never serialize request or response bodies. */
export function measureEfficiency(
  usage: LanguageModelUsage | undefined,
  costUsd?: number,
  durationMs?: number,
): EfficiencyMetrics {
  return {
    version: 1,
    steps: 1,
    inputTokens: measured(usage?.inputTokens),
    cacheReadTokens: measured(
      usage?.inputTokenDetails?.cacheReadTokens ?? usage?.cachedInputTokens,
    ),
    cacheWriteTokens: measured(usage?.inputTokenDetails?.cacheWriteTokens),
    outputTokens: measured(usage?.outputTokens),
    reasoningTokens: measured(
      usage?.outputTokenDetails?.reasoningTokens ?? usage?.reasoningTokens,
    ),
    costUsd: measured(costUsd),
    durationMs: measured(durationMs),
  };
}

export function addEfficiency(
  left: EfficiencyMetrics | undefined,
  right: EfficiencyMetrics,
): EfficiencyMetrics {
  if (!left) return right;
  const sum = (a: number | null, b: number | null) =>
    a === null || b === null ? null : a + b;
  return {
    version: 1,
    steps: sum(left.steps, right.steps),
    inputTokens: sum(left.inputTokens, right.inputTokens),
    cacheReadTokens: sum(left.cacheReadTokens, right.cacheReadTokens),
    cacheWriteTokens: sum(left.cacheWriteTokens, right.cacheWriteTokens),
    outputTokens: sum(left.outputTokens, right.outputTokens),
    reasoningTokens: sum(left.reasoningTokens, right.reasoningTokens),
    costUsd: sum(left.costUsd, right.costUsd),
    durationMs: sum(left.durationMs, right.durationMs),
  };
}

export function gatewayCost(metadata: unknown): number | undefined {
  const parsed = z
    .object({ gateway: z.object({ cost: z.union([z.string(), z.number()]) }) })
    .safeParse(metadata);
  if (!parsed.success || String(parsed.data.gateway.cost).trim() === "")
    return undefined;
  return measured(Number(parsed.data.gateway.cost)) ?? undefined;
}
