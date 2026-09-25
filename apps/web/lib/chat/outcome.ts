import { z } from "zod";

export const chatOutcomeSchema = z.object({
  runId: z.string(),
  chatId: z.string(),
  status: z.enum(["completed", "stopped", "failed", "needs-input"]),
  finishedAt: z.string(),
});
export type ChatOutcome = z.infer<typeof chatOutcomeSchema>;

export const OUTCOME_LABELS: Record<ChatOutcome["status"], string> = {
  completed: "Agent completed",
  stopped: "Agent stopped",
  failed: "Agent failed",
  "needs-input": "Agent needs your input",
};

export function resolveChatOutcome(input: {
  aborted: boolean;
  failed: boolean;
  exhausted: boolean;
  needsInput: boolean;
  finishReason?: string;
}): ChatOutcome["status"] {
  if (input.aborted) return "stopped";
  if (input.failed || input.exhausted) return "failed";
  if (input.needsInput) return "needs-input";
  // Length limits, content filters, unknown endings and unfinished tools are
  // not successful completions, even when the transport closed normally.
  return input.finishReason === "stop" ? "completed" : "failed";
}

export function collectNewOutcomes(
  previous: ReadonlySet<string>,
  outcomes: readonly ChatOutcome[],
): ChatOutcome[] {
  return outcomes.filter((outcome) => !previous.has(outcome.runId));
}
