import type { AgentModelSelection } from "@open-agents/agent";
import { isModelDisabled } from "@/lib/model-availability";
import { type ModelVariant, resolveModelSelection } from "@/lib/model-variants";

interface ResolveSubagentModelSelectionParams {
  selectedModelId: string | null | undefined;
  modelVariants: ModelVariant[];
}

/** An absent or stale override leaves each subagent's model and reasoning intact. */
export function resolveSubagentModelSelection({
  selectedModelId,
  modelVariants,
}: ResolveSubagentModelSelectionParams): AgentModelSelection | undefined {
  if (!selectedModelId) {
    return undefined;
  }

  const selection = resolveModelSelection(selectedModelId, modelVariants);
  if (
    selection.isMissingVariant ||
    isModelDisabled(selection.resolvedModelId)
  ) {
    console.warn(
      `Subagent model override "${selectedModelId}" is missing or disabled. Using each subagent's role default.`,
    );
    return undefined;
  }

  return {
    id: selection.resolvedModelId as AgentModelSelection["id"],
    ...(selection.providerOptionsByProvider
      ? { providerOptionsOverrides: selection.providerOptionsByProvider }
      : {}),
  };
}
