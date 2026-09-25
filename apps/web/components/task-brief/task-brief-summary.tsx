import { TASK_BRIEF_FIELDS, type TaskBriefSubmission } from "@/lib/task-brief";

export function TaskBriefSummary({
  submission,
}: {
  submission: TaskBriefSubmission;
}) {
  return (
    <details className="min-w-0 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {submission.action === "plan"
          ? "Task & design brief"
          : "Brief for this build"}
      </summary>
      <dl className="mt-3 space-y-3">
        {TASK_BRIEF_FIELDS.filter(({ key }) => submission.brief[key]).map(
          ({ key, label }) => (
            <div key={key}>
              <dt className="text-xs font-medium text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-1 whitespace-pre-wrap break-words">
                {submission.brief[key]}
              </dd>
            </div>
          ),
        )}
      </dl>
    </details>
  );
}
