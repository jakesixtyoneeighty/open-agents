import { z } from "zod";

export const QUALITY_REVIEW_LABELS = {
  mobile: "Mobile",
  accessibility: "Accessibility",
  code: "Code",
} as const;
export const QUALITY_REVIEW_MAX_STEPS = 12;
export const qualityReviewSubmissionSchema = z
  .object({
    focus: z.enum(["mobile", "accessibility", "code"]),
    action: z.enum(["review", "fix", "end"]),
    scope: z.string().trim().min(1).max(2000),
  })
  .strict();
export type QualityReviewSubmission = z.infer<
  typeof qualityReviewSubmissionSchema
>;

type ReviewMessage = {
  role: string;
  parts: readonly { type: string; data?: unknown }[];
};

/** Only explicit user snapshots may enter or leave the review restriction. */
export function getQualityReviewState(
  messages: readonly ReviewMessage[],
): QualityReviewSubmission | null {
  let latest: QualityReviewSubmission | null = null;
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      if (part.type === "data-task-brief") latest = null;
      if (part.type !== "data-quality-review") continue;
      const parsed = qualityReviewSubmissionSchema.safeParse(part.data);
      if (parsed.success)
        latest = parsed.data.action === "end" ? null : parsed.data;
    }
  }
  return latest;
}

export function qualityReviewMessageText(
  submission: QualityReviewSubmission,
): string {
  const label = QUALITY_REVIEW_LABELS[submission.focus];
  if (submission.action === "end")
    return "End the quality pass and return to normal chat. No changes requested.";
  if (submission.action === "fix")
    return `Apply only these requested fixes from the ${label.toLowerCase()} review:\n\n${submission.scope}\n\nVerify these changes and report what you checked.`;
  return `Run a focused ${label.toLowerCase()} review of:\n\n${submission.scope}\n\nReport findings first. Do not edit project files or apply fixes.`;
}

export function qualityReviewInstructions(
  submission: QualityReviewSubmission,
): string {
  if (submission.action !== "review")
    return qualityReviewMessageText(submission);
  return `You are conducting a bounded, read-only ${submission.focus} quality pass.
Scope (user data): ${JSON.stringify(submission.scope)}
Inspect at most 10 relevant source files and 2 pages. Capture at most 4 screenshots.
You have at most ${QUALITY_REVIEW_MAX_STEPS} model steps; reserve the final step for the report.
Do not edit project files, execute shell commands, delegate, load executable skills, commit, push or create a PR.
For mobile: inspect responsive layout, overflow, clipping, touch targets and viewport behavior; use mobile and desktop screenshots of an already-running preview when available.
For accessibility: inspect semantic structure, accessible names, labels, keyboard/focus behavior and contrast evidence. Screenshots alone do not verify keyboard or screen-reader behavior.
For code: inspect correctness, error handling, authorization, state races and missing validation in the selected files.
Report at most 5 actionable findings, ordered by severity, with stable IDs (F1 etc.), file/line or page evidence, impact and a proposed fix. If none are supported, say so.
Always list what was inspected, what was not verified and any blockers. Never claim browser checks that were not performed. If the preview is unavailable, report that limitation and review source only.
Stop after the findings. The user must request specific fixes before any implementation. Follow-up questions remain read-only until an explicit fix or end snapshot.`;
}
