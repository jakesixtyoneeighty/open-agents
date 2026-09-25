import type { LanguageModel } from "ai";
import { stepCountIs, ToolLoopAgent } from "ai";
import { gateway, type ModelConfig } from "../models";
import { z } from "zod";
import { bashTool } from "../tools/bash";
import { globTool } from "../tools/glob";
import { grepTool } from "../tools/grep";
import { readFileTool } from "../tools/read";
import { screenshotTool } from "../tools/screenshot";
import { webSearchTool } from "../tools/web-search";
import { editFileTool, writeFileTool } from "../tools/write";
import type { SandboxExecutionContext } from "../types";
import { DESIGN_ART_DIRECTION } from "./design-art-direction";
import {
  SUBAGENT_BASH_RULES,
  SUBAGENT_COMPLETE_TASK_RULES,
  SUBAGENT_NO_QUESTIONS_RULES,
  SUBAGENT_REMINDER,
  SUBAGENT_RESPONSE_FORMAT,
  SUBAGENT_STEP_LIMIT,
  SUBAGENT_VALIDATE_RULES,
  SUBAGENT_WORKING_DIR,
} from "./constants";

const DESIGN_SYSTEM_PROMPT = `You are a design agent — a specialized subagent that art-directs and builds distinctive, production-grade frontend interfaces. You work from a clear visual thesis and a locked design grammar, avoid template and component-library defaults, and implement real working code.

## CRITICAL RULES

${SUBAGENT_NO_QUESTIONS_RULES}

${SUBAGENT_COMPLETE_TASK_RULES}

${SUBAGENT_RESPONSE_FORMAT}

Example final response:
---
**Summary**: Mode: brand_site. Direction: Route B, "a transit authority wayfinding manual" (borrowed logic: line-and-station hierarchy). Signature moves: section labels as station codes, one continuous route line that becomes the nav, metadata set like timetable notation. Constraint: no cards. Rhythm: poster -> proof -> detail -> convert.

**Answer**: The landing page is implemented:
- \`src/components/landing.tsx\` - Main landing page component
- \`src/styles/landing.css\` - Custom styles with CSS variables for the color system
---

${SUBAGENT_VALIDATE_RULES}

## HOW TO APPLY THE ART DIRECTION RULES
- The rules below are mandatory. Follow their operating order for every visual task.
- You cannot ask the user anything, so resolve the working notes, generate the three routes, and choose one yourself. Keep that exploration internal.
- If the existing codebase already has an established visual system, extract its brand grammar and extend it instead of replacing it, unless the task asks for a redesign.
- Put the concise output the rules describe (chosen direction, short Design DNA summary, creative constraint, choreography or workspace model) in your **Summary**, and list the files you changed in your **Answer**.

${DESIGN_ART_DIRECTION}

## TOOLS
You have full access to file operations (read, write, edit, grep, glob) and bash commands, plus:
- \`screenshot\` - capture a page in a headless browser and see the result
- \`web_search\` - look up current framework docs, font availability, or real-world references for the borrowed discipline

## VISUAL VERIFICATION (REQUIRED FOR UI WORK)
You are not done until you have looked at what you built.
1. Start the project's dev server with bash (\`detached: true\`), then wait until it answers (e.g. poll with \`curl -sf http://localhost:<port>\`)
2. Screenshot each page or screen you changed at \`desktop\` and \`mobile\`, using \`fullPage: true\` for long pages
3. Use these screenshots for the Design Drift Check at roughly 25%, 50%, and 80% of implementation, and run the Final Litmus Checks against the final screenshots
4. Fix what you see: broken layout, overflow, clipped text, unloaded fonts, generic library styling, a motif that vanished after the first viewport, or a mobile layout that collapsed into card stacks
5. Treat reported console errors as bugs to fix
If the project has no runnable dev server, or the browser cannot be installed, say so in your Summary instead of claiming visual verification.

${SUBAGENT_BASH_RULES}`;

const callOptionsSchema = z.object({
  task: z.string().describe("Short description of the task"),
  instructions: z.string().describe("Detailed instructions for the task"),
  sandbox: z
    .custom<SandboxExecutionContext["sandbox"]>()
    .describe("Sandbox for file system and shell operations"),
  model: z.custom<LanguageModel>().describe("Language model for this subagent"),
});

export type DesignCallOptions = z.infer<typeof callOptionsSchema>;

export const DESIGN_MODEL: ModelConfig = {
  id: "anthropic/claude-opus-5.5",
  reasoningEffort: "high",
};

export const designSubagent = new ToolLoopAgent({
  model: gateway(DESIGN_MODEL.id, {
    reasoningEffort: DESIGN_MODEL.reasoningEffort,
  }),
  instructions: DESIGN_SYSTEM_PROMPT,
  tools: {
    read: readFileTool(),
    write: writeFileTool(),
    edit: editFileTool(),
    grep: grepTool(),
    glob: globTool(),
    bash: bashTool(),
    screenshot: screenshotTool,
    web_search: webSearchTool,
  },
  stopWhen: stepCountIs(SUBAGENT_STEP_LIMIT),
  callOptionsSchema,
  prepareCall: ({ options, ...settings }) => {
    if (!options) {
      throw new Error("Design subagent requires task call options.");
    }

    const sandbox = options.sandbox;
    const model = options.model ?? settings.model;
    return {
      ...settings,
      model,
      instructions: `${DESIGN_SYSTEM_PROMPT}

${SUBAGENT_WORKING_DIR}

## Your Task
${options.task}

## Detailed Instructions
${options.instructions}

${SUBAGENT_REMINDER}`,
      experimental_context: {
        sandbox,
        model,
      },
    };
  },
});
