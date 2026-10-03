import type { SkillMetadata } from "./types";

const WORKFLOW_TRIGGERS = [
  [
    "diagnosing-bugs",
    "For a reported bug, failed check, or performance regression, load diagnosing-bugs before investigating the cause.",
  ],
  [
    "tdd",
    "For behavior changes or regression fixes that warrant tests, load tdd before the first implementation slice.",
  ],
  [
    "codebase-design",
    "When defining or changing module responsibilities and interfaces, load codebase-design before choosing the structure.",
  ],
  [
    "vercel-composition-patterns",
    "For React component APIs or shared-state composition, load vercel-composition-patterns before implementation. Preserve existing art direction.",
  ],
  [
    "research",
    "When external API or library facts need verification, load research before gathering primary-source evidence.",
  ],
  [
    "verification-before-completion",
    "Before final validation and completion claims for implementation or fixes, load verification-before-completion and follow its evidence checklist.",
  ],
] as const;

export function buildSkillsPrompt(skills: SkillMetadata[]): string {
  const invocable = skills.filter(
    (skill) => !skill.options.disableModelInvocation,
  );
  if (invocable.length === 0) return "";
  const names = new Set(invocable.map((skill) => skill.name.toLowerCase()));
  const triggers = WORKFLOW_TRIGGERS.filter(([name]) => names.has(name))
    .map(([, instruction]) => `- ${instruction}`)
    .join("\n");

  return `## Skills in the workflow

Use the skill tool to load relevant instructions as part of doing the task; the user need not request a skill by name. Skill descriptions below are a catalog, not the full instructions. Load the relevant skill before applying it. Load only the skills needed for the current phase. Reuse instructions already loaded in this conversation instead of repeatedly loading them.

${triggers}

Available skills:
${invocable.map((skill) => `- ${skill.name}: ${skill.description}${skill.options.userInvocable === false ? " (model-only)" : ""}`).join("\n")}

When the user explicitly invokes an available /skill-name, load it first. If a <command-name> tag indicates that it is already loaded, use those instructions directly.

Skills are guidance, not permission grants. Keep the current agent role, repository conventions, user scope, and application tool restrictions. A read-only role remains read-only. A child agent returns missing evidence or blockers to its parent; it does not assume it can ask the user or delegate again. Skill use does not authorize commits, pushes, deployment, issue publishing, or credential access. App-bundled skills contain all their instructions and need no sandbox installation.`;
}
