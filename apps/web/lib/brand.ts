/**
 * Single source of truth for MojoCode branding copy and assets.
 */
export const BRAND = {
  name: "MojoCode",
  mascot: "Mojo",
  tagline: "People × AI × Better Software",
  headline: "Same problems. Brighter solutions.",
  description:
    "MojoCode puts Mojo to work in the cloud — a coding agent that reads your repo, runs the commands, and ships the pull request while you stay on the important bugs.",
  assets: {
    avatar: "/mojo/mojo-avatar.webp",
    face: "/mojo/mojo-face.webp",
    hero: "/mojo/mojo-hero.webp",
    icon32: "/mojo/icon-32.png",
    icon192: "/mojo/icon-192.png",
    icon512: "/mojo/icon-512.png",
    appleIcon: "/mojo/icon-180.png",
  },
} as const;

/** Rotating status lines shown while Mojo is working. */
export const MOJO_THINKING_LINES = [
  "Mojo is thinking…",
  "Peeling back the stack…",
  "Reading the code, all of it…",
  "Swinging through the call graph…",
  "Grooming the diff…",
  "Checking under every branch…",
  "Consulting the banana oracle…",
  "Solving, supporting, improving…",
] as const;

export type MojoSuggestion = {
  readonly title: string;
  readonly prompt: string;
};

/** Starter prompts shown on an empty chat. */
export const MOJO_SUGGESTIONS: readonly MojoSuggestion[] = [
  {
    title: "Tour the codebase",
    prompt:
      "Give me a guided tour of this codebase: the architecture, the main entry points, and where I should look first.",
  },
  {
    title: "Hunt a bug",
    prompt:
      "Help me track down a bug. Start by asking me what I'm seeing, then investigate the relevant code paths.",
  },
  {
    title: "Write the missing tests",
    prompt:
      "Find the most important untested code in this repo and write focused tests for it.",
  },
  {
    title: "Polish the UI",
    prompt:
      "Review the UI for rough edges — spacing, states, accessibility — and fix the top issues you find.",
  },
];

export function getMojoGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return "Burning the midnight banana?";
  if (hour < 12) return "Good morning.";
  if (hour < 17) return "Good afternoon.";
  if (hour < 22) return "Good evening.";
  return "Late-night ship mode.";
}
