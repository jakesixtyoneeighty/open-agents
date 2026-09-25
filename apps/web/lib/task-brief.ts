import { z } from "zod";

export const TASK_BRIEF_FIELDS = [
  {
    key: "goal",
    label: "What are we making?",
    placeholder: "Build a booking page for our photography studio.",
    required: true,
  },
  {
    key: "audience",
    label: "Who is it for?",
    placeholder: "Couples booking their first photo session.",
  },
  {
    key: "requirements",
    label: "What must it do?",
    placeholder: "Choose a session, see availability, and request a booking.",
  },
  {
    key: "references",
    label: "Visual direction and references",
    placeholder:
      "Warm, editorial, spacious. Add reference links or describe what to preserve.",
  },
  {
    key: "constraints",
    label: "Constraints and things to preserve",
    placeholder: "Keep the existing branding. No new paid services.",
  },
  {
    key: "acceptance",
    label: "How will we know it is done?",
    placeholder:
      "Works on mobile; required fields validate; booking confirmation appears.",
  },
] as const;

const optionalField = z.string().trim().max(3000).default("");
export const taskBriefSchema = z
  .object({
    goal: z.string().trim().min(1, "Describe what you want to make.").max(3000),
    audience: optionalField,
    requirements: optionalField,
    references: optionalField,
    constraints: optionalField,
    acceptance: optionalField,
  })
  .strict();

export const taskBriefSubmissionSchema = z
  .object({
    brief: taskBriefSchema,
    action: z.enum(["plan", "build"]),
  })
  .strict();

export type TaskBrief = z.infer<typeof taskBriefSchema>;
export type TaskBriefSubmission = z.infer<typeof taskBriefSubmissionSchema>;

type BriefMessage = {
  role: string;
  parts: readonly { type: string; data?: unknown }[];
};

/** User snapshots are authoritative; assistant/tool output cannot change mode. */
export function getTaskBriefState(
  messages: readonly BriefMessage[],
): TaskBriefSubmission | null {
  let latest: TaskBriefSubmission | null = null;
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      if (part.type !== "data-task-brief") continue;
      const parsed = taskBriefSubmissionSchema.safeParse(part.data);
      if (parsed.success) latest = parsed.data;
    }
  }
  return latest;
}

export function formatTaskBrief(brief: TaskBrief): string {
  return TASK_BRIEF_FIELDS.filter(({ key }) => brief[key].length > 0)
    .map(({ key, label }) => `### ${label}\n${brief[key]}`)
    .join("\n\n");
}

export function taskBriefMessageText(submission: TaskBriefSubmission): string {
  return submission.action === "plan"
    ? `Plan this task: ${submission.brief.goal}\n\nUse the attached brief. Inspect the project, clarify material gaps, and propose a plan for me to review before building.`
    : "Build the plan we just reviewed, using the latest task brief and my clarifications. Stay within its scope and verify the acceptance criteria.";
}
