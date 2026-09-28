import {
  addEfficiency,
  efficiencyMetricsSchema,
  type EfficiencyMetrics,
} from "@open-agents/agent";
import type { WebAgentUIMessage } from "@/app/types";

function metrics(value: unknown): EfficiencyMetrics | null {
  const parsed = efficiencyMetricsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** An allowlisted report: no prompts, paths, tool arguments or generated text. */
export function buildTokenEfficiencyReport(messages: WebAgentUIMessage[]) {
  const turns = messages
    .filter((message) => message.role === "assistant")
    .map((message, index) => {
      const main = metrics(message.metadata?.efficiency);
      const children = message.parts
        .filter((part) => part.type === "tool-task")
        .map((part) => {
          const output = "output" in part ? part.output : undefined;
          return {
            modelId: output?.modelId ?? null,
            metrics: metrics(output?.efficiency),
            completed: Array.isArray(output?.final),
          };
        });
      let combined = main;
      for (const child of children) {
        combined =
          combined && child.metrics
            ? addEfficiency(combined, child.metrics)
            : null;
      }
      // Child time overlaps main steps. It is not additive wall-clock latency.
      if (combined) combined = { ...combined, durationMs: null };
      return {
        turn: index + 1,
        modelId: message.metadata?.modelId ?? null,
        finishReason: message.metadata?.lastStepFinishReason ?? null,
        main,
        children,
        combined,
      };
    });
  return { version: 1, turns };
}
