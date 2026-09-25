import type { WebAgentUIMessage } from "@/app/types";
import {
  getQualityReviewState,
  qualityReviewInstructions,
  QUALITY_REVIEW_MAX_STEPS,
} from "@/lib/quality-review";

export async function resolveQualityReview(messages: WebAgentUIMessage[]) {
  "use step";
  const submission = getQualityReviewState(messages);
  return {
    reviewing: submission?.action === "review",
    active: submission !== null,
    instructions: submission ? qualityReviewInstructions(submission) : "",
    maxSteps:
      submission?.action === "review" ? QUALITY_REVIEW_MAX_STEPS : undefined,
  };
}
