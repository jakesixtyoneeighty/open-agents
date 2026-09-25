import {
  type GlobalSkillRef,
  globalSkillRefsSchema,
} from "@/lib/skills/global-skill-refs";
import type { RepoPreferencesSettings } from "./schema";

type RepoSettings = Pick<
  RepoPreferencesSettings,
  "modelId" | "skillRefs" | "setupCommand" | "checkCommand" | "instructions"
>;

/** The repository's model wins over the user's default when set. */
export function resolveRepoModelId(
  repoPreferences: Pick<RepoSettings, "modelId"> | null,
  userDefaultModelId: string,
): string {
  return repoPreferences?.modelId ?? userDefaultModelId;
}

/** User global skills plus repository skills, de-duplicated. */
export function mergeRepoSkillRefs(
  userSkillRefs: readonly GlobalSkillRef[],
  repoPreferences: Pick<RepoSettings, "skillRefs"> | null,
): GlobalSkillRef[] {
  const merged = [...userSkillRefs, ...(repoPreferences?.skillRefs ?? [])];
  const parsed = globalSkillRefsSchema.safeParse(merged);
  return parsed.success ? parsed.data : [...userSkillRefs];
}

/**
 * Prompt text for the repository's saved instructions and commands.
 * Returns null when none is set so nothing is added to the prompt.
 */
export function buildRepoPreferencesPrompt(
  repoPreferences: Pick<
    RepoSettings,
    "setupCommand" | "checkCommand" | "instructions"
  > | null,
): string | null {
  if (!repoPreferences) return null;
  const sections: string[] = [];

  if (repoPreferences.instructions) {
    sections.push(
      `The user saved these instructions for this repository:\n\n${repoPreferences.instructions}`,
    );
  }

  if (repoPreferences.setupCommand) {
    sections.push(
      [
        "This setup command runs when the sandbox workspace is created:",
        "```bash",
        repoPreferences.setupCommand,
        "```",
        "Its outcome is not reported to you. If dependencies or tools seem missing, re-run it.",
      ].join("\n"),
    );
  }

  if (repoPreferences.checkCommand) {
    sections.push(
      [
        "The user's check command for this repository is:",
        "```bash",
        repoPreferences.checkCommand,
        "```",
        "Prefer it over guessing verification steps. Run it after making changes and before reporting work as done; report its real result, including failures.",
      ].join("\n"),
    );
  }

  if (sections.length === 0) return null;
  return `## Repository preferences\n\n${sections.join("\n\n")}`;
}
