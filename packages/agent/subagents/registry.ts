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
      "Use for any frontend work where visual identity matters (brand sites, product UIs, tool UIs, editorial pages). Art-directs a locked design grammar before building, and avoids template and component-library defaults.",
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
