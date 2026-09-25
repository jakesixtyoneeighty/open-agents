import type { SandboxState } from "@open-agents/sandbox";
import { stepCountIs, ToolLoopAgent, type ToolSet } from "ai";
import { z } from "zod";
import { addCacheControl } from "./context-management";
import {
  type GatewayModelId,
  gateway,
  type ProviderOptionsByProvider,
  type ReasoningEffort,
} from "./models";

import type { SkillMetadata } from "./skills/types";
import { buildSystemPrompt } from "./system-prompt";
import { getPlanningTools } from "./planning";
import {
  askUserQuestionTool,
  bashTool,
  editFileTool,
  globTool,
  grepTool,
  readFileTool,
  skillTool,
  taskTool,
  todoWriteTool,
  webFetchTool,
  webSearchTool,
  writeFileTool,
} from "./tools";
import type { ScreenshotStore } from "./tools/screenshot-store";

export interface AgentModelSelection {
  id: GatewayModelId;
  providerOptionsOverrides?: ProviderOptionsByProvider;
}

export type OpenAgentModelInput = GatewayModelId | AgentModelSelection;

/**
 * Repository context for server-side GitHub tools. Serializable, and never
 * carries a token: tools resolve the user's credentials when they execute.
 */
export interface AgentGitHubContext {
  userId: string;
  owner: string;
  repo: string;
}

export interface AgentSandboxContext {
  state: SandboxState;
  workingDirectory: string;
  currentBranch?: string;
  environmentDetails?: string;
}

const callOptionsSchema = z.object({
  sandbox: z.custom<AgentSandboxContext>(),
  model: z.custom<OpenAgentModelInput>().optional(),
  subagentModel: z.custom<OpenAgentModelInput>().optional(),
  customInstructions: z.string().optional(),
  skills: z.custom<SkillMetadata[]>().optional(),
  github: z.custom<AgentGitHubContext>().optional(),
  planningMode: z.boolean().optional(),
  screenshotStore: z.custom<ScreenshotStore>().optional(),
});

export type OpenAgentCallOptions = z.infer<typeof callOptionsSchema>;

export const defaultModelLabel = "openai/gpt-6-astra" as const;
/** Reasoning level for the main agent, whichever model the user selects. */
const MAIN_REASONING_EFFORT: ReasoningEffort = "high";
export const defaultModel = gateway(defaultModelLabel, {
  reasoningEffort: MAIN_REASONING_EFFORT,
});

function normalizeAgentModelSelection(
  selection: OpenAgentModelInput | undefined,
  fallbackId: GatewayModelId,
): AgentModelSelection {
  if (!selection) {
    return { id: fallbackId };
  }

  return typeof selection === "string" ? { id: selection } : selection;
}

const baseTools = {
  todo_write: todoWriteTool,
  read: readFileTool(),
  write: writeFileTool(),
  edit: editFileTool(),
  grep: grepTool(),
  glob: globTool(),
  bash: bashTool(),
  task: taskTool,
  ask_user_question: askUserQuestionTool,
  skill: skillTool,
  web_fetch: webFetchTool,
  web_search: webSearchTool,
} satisfies ToolSet;

export interface CreateOpenAgentOptions<TExtraTools extends ToolSet> {
  /**
   * Host-provided tools merged into the base toolset. Use this for tools that
   * need host credentials (e.g. GitHub), which must stay out of the sandbox.
   */
  extraTools?: TExtraTools;
}

export function createOpenAgent<
  TExtraTools extends ToolSet = Record<never, never>,
>(createOptions: CreateOpenAgentOptions<TExtraTools> = {}) {
  const tools = {
    ...baseTools,
    ...(createOptions.extraTools ?? ({} as TExtraTools)),
  };
  const hasGitHubTools = Object.keys(tools).some((name) =>
    name.startsWith("github_"),
  );

  return new ToolLoopAgent({
    model: defaultModel,
    instructions: buildSystemPrompt({}),
    tools,
    stopWhen: stepCountIs(1),
    callOptionsSchema,
    prepareStep: ({ messages, model, steps: _steps }) => {
      return {
        messages: addCacheControl({
          messages,
          model,
        }),
      };
    },
    prepareCall: ({ options, ...settings }) => {
      if (!options) {
        throw new Error("Open Agent requires call options with sandbox.");
      }

      const mainSelection = normalizeAgentModelSelection(
        options.model,
        defaultModelLabel,
      );
      const subagentSelection = options.subagentModel
        ? normalizeAgentModelSelection(options.subagentModel, defaultModelLabel)
        : undefined;

      const callModel = gateway(mainSelection.id, {
        providerOptionsOverrides: mainSelection.providerOptionsOverrides,
        reasoningEffort: MAIN_REASONING_EFFORT,
      });
      const subagentModel = subagentSelection
        ? gateway(subagentSelection.id, {
            providerOptionsOverrides:
              subagentSelection.providerOptionsOverrides,
          })
        : undefined;
      const customInstructions = options.customInstructions;
      const sandbox = options.sandbox;
      const skills = options.skills ?? [];

      const instructions = buildSystemPrompt({
        cwd: sandbox.workingDirectory,
        currentBranch: sandbox.currentBranch,
        customInstructions,
        environmentDetails: sandbox.environmentDetails,
        skills: options.planningMode ? [] : skills,
        modelId: mainSelection.id,
        githubToolsEnabled:
          !options.planningMode &&
          hasGitHubTools &&
          options.github !== undefined,
      });

      return {
        ...settings,
        model: callModel,
        tools: addCacheControl({
          tools: options.planningMode
            ? getPlanningTools(settings.tools ?? tools)
            : (settings.tools ?? tools),
          model: callModel,
        }),
        instructions,
        experimental_context: {
          sandbox,
          skills,
          model: callModel,
          subagentModel,
          github: options.github,
          screenshotStore: options.screenshotStore,
        },
      };
    },
  });
}

export const openAgent = createOpenAgent();

export type OpenAgent = typeof openAgent;
