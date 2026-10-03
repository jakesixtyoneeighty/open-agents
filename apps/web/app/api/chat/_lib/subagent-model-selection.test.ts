import { describe, expect, test } from "bun:test";
import { resolveSubagentModelSelection } from "./subagent-model-selection";

describe("resolveSubagentModelSelection", () => {
  test.each([undefined, null, "", "variant:deleted", "openai/gpt-5.4-pro"])(
    "preserves role defaults for absent or invalid override %s",
    (selectedModelId) => {
      expect(
        resolveSubagentModelSelection({ selectedModelId, modelVariants: [] }),
      ).toBeUndefined();
    },
  );

  test("preserves role defaults when a variant targets a disabled model", () => {
    expect(
      resolveSubagentModelSelection({
        selectedModelId: "variant:disabled",
        modelVariants: [
          {
            id: "variant:disabled",
            name: "Disabled",
            baseModelId: "openai/gpt-5.4-pro",
            providerOptions: { reasoningEffort: "high" },
          },
        ],
      }),
    ).toBeUndefined();
  });

  test("retains an explicit model override", () => {
    expect(
      resolveSubagentModelSelection({
        selectedModelId: "openai/gpt-6.1-sol",
        modelVariants: [],
      }),
    ).toEqual({ id: "openai/gpt-6.1-sol" });
  });

  test("retains variant reasoning and OpenAI non-persistence options", () => {
    expect(
      resolveSubagentModelSelection({
        selectedModelId: "variant:custom",
        modelVariants: [
          {
            id: "variant:custom",
            name: "Custom",
            baseModelId: "openai/gpt-6.1-sol",
            providerOptions: { reasoningEffort: "high", store: true },
          },
        ],
      }),
    ).toEqual({
      id: "openai/gpt-6.1-sol",
      providerOptionsOverrides: {
        openai: { reasoningEffort: "high", store: false },
      },
    });
  });
});
