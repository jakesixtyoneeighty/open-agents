import { createOpenAgent } from "@open-agents/agent";
import { githubTools } from "@/lib/agent-tools/github-tools";

// Configure the agent here - single source of truth for the web app
export const webAgent = createOpenAgent({ extraTools: githubTools });
