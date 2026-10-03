import * as path from "path";
import { tool } from "ai";
import { z } from "zod";
import { getSandbox } from "./utils";
import {
  extractSkillBody,
  substituteArguments,
  injectSkillDirectory,
} from "../skills/loader";
import type { SkillMetadata } from "../skills/types";
import { getBundledSkillContent } from "../skills/bundled";

/**
 * Extended agent context that includes skills.
 */
interface SkillAgentContext {
  skills?: SkillMetadata[];
}

/**
 * Get skills from experimental context.
 */
export function getSkills(experimental_context: unknown): SkillMetadata[] {
  const context = experimental_context as SkillAgentContext | undefined;
  return context?.skills ?? [];
}

const skillInputSchema = z.object({
  skill: z.string().describe("The skill name to invoke"),
  args: z.string().optional().describe("Optional arguments for the skill"),
});

export const skillTool = tool({
  description: `Load skill instructions in the current agent conversation. Skills do not grant new tools or permissions.

When users ask you to perform tasks, check if any of the available skills can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

When users ask you to run a "slash command" or reference "/<something>" (e.g., "/commit", "/review-pr"), they are referring to a skill. Use this tool to invoke the corresponding skill.

Example:
  User: "run /commit"
  Assistant: [Calls skill tool with skill: "commit"]

How to invoke:
- Use this tool with the skill name and optional arguments
- Examples:
  - skill: "pdf" - invoke the pdf skill
  - skill: "commit", args: "-m 'Fix bug'" - invoke with arguments

Important:
- Load a relevant skill before starting the corresponding phase of work; reuse instructions already loaded in this conversation
- When the user's message starts with "/<name>", they are invoking a skill — call this tool FIRST before any other tool
- NEVER just announce or mention a skill without actually calling this tool
- Only use skills listed in "Available skills" in your system prompt
- If you see a <command-name> tag in the conversation, the skill is ALREADY loaded - follow its instructions directly`,
  inputSchema: skillInputSchema,
  execute: async ({ skill, args }, { experimental_context }) => {
    const skills = getSkills(experimental_context);

    // Find the skill by name (case-insensitive to match slash command behavior)
    const normalizedSkillName = skill.toLowerCase();
    const foundSkill = skills.find(
      (s) => s.name.toLowerCase() === normalizedSkillName,
    );
    if (!foundSkill) {
      const availableSkills = skills.map((s) => s.name).join(", ");
      return {
        success: false,
        error: `Skill '${skill}' not found. Available skills: ${availableSkills || "none"}`,
      };
    }

    // Check if skill disables model invocation
    if (foundSkill.options.disableModelInvocation) {
      return {
        success: false,
        error: `Skill '${skill}' cannot be invoked by the model (disable-model-invocation is set)`,
      };
    }

    if (foundSkill.source === "bundled") {
      const body = getBundledSkillContent(foundSkill.name);
      if (!body) {
        return {
          success: false,
          error: `Bundled skill '${skill}' is unavailable`,
        };
      }
      return {
        success: true,
        skillName: foundSkill.name,
        skillPath: foundSkill.path,
        content: `App-bundled instructions (no sandbox files or scripts). Follow the current role, task scope, and tool permissions.\n\n${substituteArguments(body, args)}`,
      };
    }

    // Load skill content via sandbox
    const sandbox = await getSandbox(experimental_context, "skill");
    const skillFilePath = path.join(foundSkill.path, foundSkill.filename);
    let fileContent: string;
    try {
      fileContent = await sandbox.readFile(skillFilePath, "utf-8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to read skill file: ${message}`,
      };
    }

    // Parse and extract body (skip frontmatter)
    const body = extractSkillBody(fileContent);

    // Inject skill directory for script access
    const bodyWithDir = injectSkillDirectory(body, foundSkill.path);

    // Substitute arguments
    const content = substituteArguments(bodyWithDir, args);

    return {
      success: true,
      skillName: skill,
      skillPath: foundSkill.path,
      content,
    };
  },
});

export type SkillToolInput = z.infer<typeof skillInputSchema>;
