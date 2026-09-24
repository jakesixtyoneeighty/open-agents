import {
  createGateway,
  defaultSettingsMiddleware,
  wrapLanguageModel,
  type GatewayModelId,
  type JSONValue,
  type LanguageModel,
} from "ai";
import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";

// Claude 4.6+ (including all 5.x models) use adaptive thinking.
function supportsAdaptiveAnthropicThinking(modelId: string): boolean {
  const match = /claude-[a-z]+-(\d+)(?:[.-](\d+))?/.exec(modelId);
  if (!match) {
    return false;
  }

  const major = Number(match[1]);
  const minor = Number(match[2] ?? 0);
  return major > 4 || (major === 4 && minor >= 6);
}

/** Provider-agnostic reasoning level, mapped to each provider's own option. */
export type ReasoningEffort = "low" | "medium" | "high";

const DEFAULT_REASONING_EFFORT: ReasoningEffort = "medium";

// Models with adaptive thinking support use effort control.
// Older models use the legacy extended thinking API with a budget.
function getAnthropicSettings(
  modelId: string,
  reasoningEffort: ReasoningEffort,
): AnthropicLanguageModelOptions {
  if (supportsAdaptiveAnthropicThinking(modelId)) {
    return {
      effort: reasoningEffort,
      thinking: { type: "adaptive" },
    } satisfies AnthropicLanguageModelOptions;
  }

  return {
    thinking: { type: "enabled", budgetTokens: 8000 },
  };
}

function isJsonObject(value: unknown): value is Record<string, JSONValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toProviderOptionsRecord(
  options: Record<string, unknown>,
): Record<string, JSONValue> {
  return options as Record<string, JSONValue>;
}

function mergeRecords(
  base: Record<string, JSONValue>,
  override: Record<string, JSONValue>,
): Record<string, JSONValue> {
  const merged: Record<string, JSONValue> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const existingValue = merged[key];

    if (isJsonObject(existingValue) && isJsonObject(value)) {
      merged[key] = mergeRecords(existingValue, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

export type ProviderOptionsByProvider = Record<
  string,
  Record<string, JSONValue>
>;

export function mergeProviderOptions(
  defaults: ProviderOptionsByProvider,
  overrides?: ProviderOptionsByProvider,
): ProviderOptionsByProvider {
  if (!overrides || Object.keys(overrides).length === 0) {
    return defaults;
  }

  const merged: ProviderOptionsByProvider = { ...defaults };

  for (const [provider, providerOverrides] of Object.entries(overrides)) {
    const providerDefaults = merged[provider];

    if (!providerDefaults) {
      merged[provider] = providerOverrides;
      continue;
    }

    merged[provider] = mergeRecords(providerDefaults, providerOverrides);
  }

  return merged;
}

/** A model plus the reasoning level it should run at. */
export interface ModelConfig {
  id: GatewayModelId;
  reasoningEffort?: ReasoningEffort;
}

export interface GatewayConfig {
  baseURL: string;
  apiKey: string;
}

export interface GatewayOptions {
  config?: GatewayConfig;
  providerOptionsOverrides?: ProviderOptionsByProvider;
  /** Reasoning level; explicit `providerOptionsOverrides` still take precedence. */
  reasoningEffort?: ReasoningEffort;
  appName?: string;
  appUrl?: string;
}

export type { GatewayModelId, LanguageModel, JSONValue };

export function shouldApplyOpenAIReasoningDefaults(modelId: string): boolean {
  return (
    modelId.startsWith("openai/gpt-5") || modelId.startsWith("openai/gpt-6")
  );
}

function shouldApplyOpenAITextVerbosityDefaults(modelId: string): boolean {
  return modelId.startsWith("openai/gpt-5.4");
}

export function getProviderOptionsForModel(
  modelId: string,
  providerOptionsOverrides?: ProviderOptionsByProvider,
  reasoningEffort?: ReasoningEffort,
): ProviderOptionsByProvider {
  const defaultProviderOptions: ProviderOptionsByProvider = {};

  // Apply anthropic defaults
  if (modelId.startsWith("anthropic/")) {
    defaultProviderOptions.anthropic = toProviderOptionsRecord(
      getAnthropicSettings(
        modelId,
        reasoningEffort ?? DEFAULT_REASONING_EFFORT,
      ),
    );
  }

  // OpenAI model responses should never be persisted.
  if (modelId.startsWith("openai/")) {
    defaultProviderOptions.openai = toProviderOptionsRecord({
      store: false,
    } satisfies OpenAIResponsesProviderOptions);
  }

  // Apply OpenAI defaults for all GPT-5 and GPT-6 variants to expose encrypted reasoning content.
  // This avoids Responses API failures when `store: false`, e.g.:
  // "Item with id 'rs_...' not found. Items are not persisted when `store` is set to false."
  if (shouldApplyOpenAIReasoningDefaults(modelId)) {
    defaultProviderOptions.openai = mergeRecords(
      defaultProviderOptions.openai ?? {},
      toProviderOptionsRecord({
        reasoningSummary: "detailed",
        include: ["reasoning.encrypted_content"],
      } satisfies OpenAIResponsesProviderOptions),
    );
  }

  if (reasoningEffort && shouldApplyOpenAIReasoningDefaults(modelId)) {
    defaultProviderOptions.openai = mergeRecords(
      defaultProviderOptions.openai ?? {},
      toProviderOptionsRecord({
        reasoningEffort,
      } satisfies OpenAIResponsesProviderOptions),
    );
  }

  // Gemini 3+ models use a thinking level rather than a token budget.
  if (reasoningEffort && modelId.startsWith("google/gemini-3")) {
    defaultProviderOptions.google = {
      thinkingConfig: { thinkingLevel: reasoningEffort },
    };
  }

  if (shouldApplyOpenAITextVerbosityDefaults(modelId)) {
    defaultProviderOptions.openai = mergeRecords(
      defaultProviderOptions.openai ?? {},
      toProviderOptionsRecord({
        textVerbosity: "low",
      } satisfies OpenAIResponsesProviderOptions),
    );
  }

  const providerOptions = mergeProviderOptions(
    defaultProviderOptions,
    providerOptionsOverrides,
  );

  // Enforce OpenAI non-persistence even when custom provider overrides are present.
  if (modelId.startsWith("openai/")) {
    providerOptions.openai = mergeRecords(
      providerOptions.openai ?? {},
      toProviderOptionsRecord({
        store: false,
      } satisfies OpenAIResponsesProviderOptions),
    );
  }

  return providerOptions;
}

export function gateway(
  modelId: GatewayModelId,
  options: GatewayOptions = {},
): LanguageModel {
  const { config, providerOptionsOverrides, reasoningEffort, appName, appUrl } =
    options;

  const attributionHeaders = {
    "http-referer": appUrl ?? "https://open-agents.dev",
    "x-title": appName ?? "Open Agents",
  };

  const baseGateway = config
    ? createGateway({
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        headers: attributionHeaders,
      })
    : createGateway({ headers: attributionHeaders });

  let model: LanguageModel = baseGateway(modelId);

  const providerOptions = getProviderOptionsForModel(
    modelId,
    providerOptionsOverrides,
    reasoningEffort,
  );

  if (Object.keys(providerOptions).length > 0) {
    model = wrapLanguageModel({
      model,
      middleware: defaultSettingsMiddleware({
        settings: { providerOptions },
      }),
    });
  }

  return model;
}
