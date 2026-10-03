import bundle from "./bundled.generated.json";
import type { SkillMetadata } from "./types";

export type SkillRole = "main" | "explorer" | "executor" | "design";

// Explorer skills contain explicit read-only branches; implementation guidance
// is not advertised to this role. Other roles keep the full curated catalog.
const EXPLORER_SKILLS = new Set(["research", "codebase-design"]);

export function getBundledSkills(role: SkillRole = "main"): SkillMetadata[] {
  return bundle
    .filter((skill) => role !== "explorer" || EXPLORER_SKILLS.has(skill.name))
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      source: "bundled",
      path: `open-agents:skills/${skill.name}`,
      filename: "SKILL.md",
      options: {},
    }));
}

export function getBundledSkillContent(name: string): string | undefined {
  return bundle.find((skill) => skill.name === name.toLowerCase())?.content;
}

/** Project/global discovery order wins; bundled defaults fill missing names. */
export function withBundledSkills(
  discovered: SkillMetadata[] = [],
  role: SkillRole = "main",
): SkillMetadata[] {
  const skills = new Map<string, SkillMetadata>();
  for (const skill of discovered) {
    // Never reuse stale bundled metadata from a prior app version or parent role.
    if (skill.source === "bundled") continue;
    if (role === "explorer" && !EXPLORER_SKILLS.has(skill.name.toLowerCase()))
      continue;
    const key = skill.name.toLowerCase();
    if (!skills.has(key)) skills.set(key, skill);
  }
  for (const skill of getBundledSkills(role)) {
    if (!skills.has(skill.name)) skills.set(skill.name, skill);
  }
  return [...skills.values()];
}
