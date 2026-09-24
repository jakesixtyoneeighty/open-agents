import { DESIGN_MODEL, designSubagent } from "./design";
import { EXECUTOR_MODEL, executorSubagent } from "./executor";
import { EXPLORER_MODEL, explorerSubagent } from "./explorer";

export const SUBAGENT_REGISTRY = {
  explorer: {
    shortDescription:
      "Use for read-only codebase exploration, tracing behavior, and answering questions without changing files",
    agent: explorerSubagent,
    model: EXPLORER_MODEL,
  },
  executor: {
    shortDescription:
      "Use for well-scoped implementation work, including edits, scaffolding, refactors, and other file changes",
    agent: executorSubagent,
    model: EXECUTOR_MODEL,
  },
  design: {
    shortDescription:
      "Use for creating distinctive, production-grade frontend interfaces with high design quality. Generates creative, polished code that avoids generic AI aesthetics.",
    agent: designSubagent,
    model: DESIGN_MODEL,
  },
} as const;

export const SUBAGENT_TYPES = Object.keys(SUBAGENT_REGISTRY) as [
  keyof typeof SUBAGENT_REGISTRY,
  ...(keyof typeof SUBAGENT_REGISTRY)[],
];

export type SubagentType = keyof typeof SUBAGENT_REGISTRY;

export function buildSubagentSummaryLines(): string {
  return SUBAGENT_TYPES.map((type) => {
    const subagent = SUBAGENT_REGISTRY[type];
    return `- \`${type}\` - ${subagent.shortDescription}`;
  }).join("\n");
}
