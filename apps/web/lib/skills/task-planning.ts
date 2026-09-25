import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractSkillBody } from "@open-agents/agent";

const SKILL_PATH = "lib/skills/task-planning/SKILL.md";

/** Load the hosted skill inside a server step, independently of the sandbox. */
export async function loadTaskPlanningSkill(
  workingDirectory = process.cwd(),
): Promise<string> {
  // Next runs from apps/web; repository-level tests run from the workspace root.
  const candidates = [
    path.join(workingDirectory, SKILL_PATH),
    path.join(workingDirectory, "apps/web", SKILL_PATH),
  ];

  for (const candidate of candidates) {
    let content: string;
    try {
      content = await readFile(candidate, "utf-8");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }
      throw error;
    }

    const body = extractSkillBody(content).trim();
    if (!body) {
      throw new Error("The bundled task planning skill is empty.");
    }
    return body;
  }

  throw new Error("The bundled task planning skill could not be loaded.");
}
