import { z } from "zod";
import { globalSkillRefsSchema } from "@/lib/skills/global-skill-refs";

export const REPO_SETUP_COMMAND_MAX_LENGTH = 2000;
export const REPO_CHECK_COMMAND_MAX_LENGTH = 1000;
export const REPO_INSTRUCTIONS_MAX_LENGTH = 8000;
export const REPO_SKILL_REFS_MAX = 20;

const REPO_COORDINATE_PATTERN = /^[A-Za-z0-9_.-]+$/;

export const repoCoordinateSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(REPO_COORDINATE_PATTERN, "Invalid repository owner or name")
  .refine(
    (value) => value !== "." && value !== "..",
    "Invalid repository owner or name",
  );

/** Blank or whitespace-only text is stored as null (use the default). */
function optionalText(maxLength: number, label: string) {
  return z
    .string()
    .max(maxLength, `${label} must be at most ${maxLength} characters`)
    .nullable()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : null;
    });
}

export const repoPreferencesInputSchema = z.object({
  modelId: optionalText(200, "Model"),
  skillRefs: globalSkillRefsSchema.refine(
    (refs) => refs.length <= REPO_SKILL_REFS_MAX,
    `At most ${REPO_SKILL_REFS_MAX} skills`,
  ),
  setupCommand: optionalText(REPO_SETUP_COMMAND_MAX_LENGTH, "Setup command"),
  checkCommand: optionalText(REPO_CHECK_COMMAND_MAX_LENGTH, "Check command"),
  instructions: optionalText(REPO_INSTRUCTIONS_MAX_LENGTH, "Instructions"),
});

export type RepoPreferencesInput = z.input<typeof repoPreferencesInputSchema>;
export type RepoPreferencesSettings = z.output<
  typeof repoPreferencesInputSchema
>;

export interface RepoPreferencesData extends RepoPreferencesSettings {
  repoOwner: string;
  repoName: string;
  updatedAt: string;
}

export const EMPTY_REPO_PREFERENCES: RepoPreferencesSettings = {
  modelId: null,
  skillRefs: [],
  setupCommand: null,
  checkCommand: null,
  instructions: null,
};
