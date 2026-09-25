import type { WebAgentUIMessage } from "@/app/types";
import { getTaskBriefState } from "@/lib/task-brief";

export async function resolveTaskPlanning(messages: WebAgentUIMessage[]) {
  "use step";
  const planningMode = getTaskBriefState(messages)?.action === "plan";
  const instructions = planningMode
    ? await (await import("@/lib/skills/task-planning")).loadTaskPlanningSkill()
    : "";
  return {
    planningMode,
    instructions,
  };
}
