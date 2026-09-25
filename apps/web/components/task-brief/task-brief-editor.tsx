"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  TASK_BRIEF_FIELDS,
  taskBriefSchema,
  type TaskBrief,
} from "@/lib/task-brief";

export function TaskBriefEditor({
  initialBrief,
  disabled,
  error,
  onSubmit,
  onCancel,
}: {
  initialBrief?: TaskBrief;
  disabled: boolean;
  error: string | null;
  onSubmit: (brief: TaskBrief) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [brief, setBrief] = useState<TaskBrief>(
    initialBrief ?? {
      goal: "",
      audience: "",
      requirements: "",
      references: "",
      constraints: "",
      acceptance: "",
    },
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        const result = taskBriefSchema.safeParse(brief);
        if (!result.success) {
          setValidationError(
            result.error.issues[0]?.message ?? "Check your brief.",
          );
          return;
        }
        setValidationError(null);
        onSubmit(result.data);
      }}
    >
      <DialogHeader>
        <DialogTitle>Task & design brief</DialogTitle>
        <DialogDescription>
          Give the agent a clear starting point. Only the goal is required; the
          agent can help fill the gaps before you build.
        </DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 max-h-[60dvh] gap-4 overflow-y-auto px-1 pb-1 sm:grid-cols-2">
        {TASK_BRIEF_FIELDS.map((field) => (
          <div
            key={field.key}
            className={
              field.key === "goal" || field.key === "acceptance"
                ? "space-y-2 sm:col-span-2"
                : "space-y-2"
            }
          >
            <Label htmlFor={`${id}-${field.key}`}>
              {field.label}
              {field.key !== "goal" && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  (optional)
                </span>
              )}
            </Label>
            <Textarea
              id={`${id}-${field.key}`}
              value={brief[field.key]}
              placeholder={field.placeholder}
              onChange={(event) =>
                setBrief((current) => ({
                  ...current,
                  [field.key]: event.target.value,
                }))
              }
              required={field.key === "goal"}
              maxLength={3000}
              rows={3}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Planning inspects the project without changing its files. This brief is
        saved in the conversation when submitted and included if you share the
        chat.
      </p>
      {(validationError || error) && (
        <p role="alert" className="text-sm text-destructive">
          {validationError || error}
        </p>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={disabled}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={disabled || !brief.goal.trim()}>
          Plan with this brief
        </Button>
      </DialogFooter>
    </form>
  );
}
