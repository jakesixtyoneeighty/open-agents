/**
 * Set when a user chooses "Skip for now" on the GitHub connect prompt, so
 * signing in doesn't keep bouncing them back to /get-started.
 */
export const GITHUB_PROMPT_DISMISSED_COOKIE = "mojo_github_prompt_dismissed";
export const GITHUB_PROMPT_DISMISSED_MAX_AGE = 60 * 60 * 24 * 30;
