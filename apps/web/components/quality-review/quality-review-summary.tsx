import {
  QUALITY_REVIEW_LABELS,
  type QualityReviewSubmission,
} from "@/lib/quality-review";

export function QualityReviewSummary({
  submission,
}: {
  submission: QualityReviewSubmission;
}) {
  return (
    <div className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
      {QUALITY_REVIEW_LABELS[submission.focus]} ·{" "}
      {submission.action === "review"
        ? "Review only"
        : submission.action === "fix"
          ? "Requested fixes"
          : "Review ended"}
    </div>
  );
}
