import { tool } from "ai";
import { commandNeedsApproval } from "./bash";
import { executeProcess } from "./process-remote";
import { processInputSchema, processOutputSchema } from "./process-schema";

export const processTool = tool({
  needsApproval: (input) =>
    input.action === "start" && commandNeedsApproval(input.command),
  description: `Manage background jobs in this chat/task: start, list, status, wait, stop, logs.
- start returns a stable processId and commandId. A launched/running process is NOT ready. Configure readiness with loopback HTTP expected status or literal log text, then wait until ready before using browser_session. HTTP probes do not follow redirects; they confirm an endpoint, not its owner or UI correctness.
- Jobs survive model steps. Default runtime deadline is 1 hour, max 6 hours; deadlines stop the process group and report timed_out. A wait is bounded to 30 seconds and waitTimedOut does NOT stop the job.
- status checks readiness again; list lists retained jobs. stop only targets jobs owned by this chat/task and confirms termination. Do not use kill/pkill or free ports by killing unrelated processes.
- logs returns Unicode-safe stdout/stderr pages; use nextOffset, or command_output with commandId. Logs retain the first 1 MiB per stream and explicitly report truncation. Never rerun commands to recover logs.
- Records/logs last 6 hours after completion on the same sandbox filesystem. Hibernation/replacement/controller loss invalidates running jobs (expired/unknown); they are never silently restarted. Reusing the same launch call recovers its process instead of launching twice.
- Prefer run_checks for revision-bound verification. A job exiting 0 is command completion, not structured check evidence. Run foreground commands; self-daemonizing commands that create a new session can escape group cleanup. Stop unused jobs when finished. Do not enter secrets in commands; inputs and logs persist in transcripts.`,
  inputSchema: processInputSchema,
  outputSchema: processOutputSchema,
  execute: (input, { experimental_context, toolCallId, abortSignal }) =>
    executeProcess(input, experimental_context, toolCallId, abortSignal),
});
