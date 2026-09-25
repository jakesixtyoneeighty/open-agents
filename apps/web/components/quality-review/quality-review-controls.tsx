"use client";

import { useRef, useState } from "react";
import { ScanSearch } from "lucide-react";
import type { WebAgentUIMessage } from "@/app/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  getQualityReviewState,
  QUALITY_REVIEW_LABELS,
  qualityReviewMessageText,
  type QualityReviewSubmission,
} from "@/lib/quality-review";

export function QualityReviewControls({
  messages,
  disabled,
  fixBlocked,
  onSend,
}: {
  messages: WebAgentUIMessage[];
  disabled: boolean;
  fixBlocked: boolean;
  onSend: (message: { parts: WebAgentUIMessage["parts"] }) => Promise<void>;
}) {
  const current = getQualityReviewState(messages);
  const reviewing = current?.action === "review";
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"review" | "fix">("review");
  const [focus, setFocus] =
    useState<QualityReviewSubmission["focus"]>("mobile");
  const [scope, setScope] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrySubmission, setRetrySubmission] =
    useState<QualityReviewSubmission | null>(null);
  const sendingRef = useRef(false);
  const last = messages.at(-1);
  const hasReport =
    last?.role === "assistant" &&
    last.metadata?.lastStepFinishReason === "stop" &&
    last.parts.some(
      (part) => part.type === "text" && part.text.trim().length > 0,
    );

  const submit = async (submission: QualityReviewSubmission) => {
    if (disabled || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    setOpen(false);
    try {
      setRetrySubmission(submission);
      await onSend({
        parts: [
          { type: "text", text: qualityReviewMessageText(submission) },
          { type: "data-quality-review", data: submission },
        ],
      });
      setRetrySubmission(null);
    } catch {
      setError(
        "Could not send the quality pass. Your scope is kept; please retry.",
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <div className="mb-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={disabled || sending}
          onClick={() => {
            setAction("review");
            setOpen(true);
          }}
        >
          <ScanSearch className="size-3.5" /> Quality pass
        </Button>
        {reviewing && (
          <>
            <span className="text-xs text-muted-foreground">
              {QUALITY_REVIEW_LABELS[current.focus]} · review only
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || sending || fixBlocked || !hasReport}
              onClick={() => {
                setAction("fix");
                setFocus(current.focus);
                setScope("");
                setOpen(true);
              }}
            >
              Request fixes
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || sending}
              onClick={() => {
                void submit({ ...current, action: "end" });
              }}
            >
              End review
            </Button>
          </>
        )}
      </div>
      {error && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
          {retrySubmission && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                disabled ||
                sending ||
                (retrySubmission.action === "fix" && fixBlocked)
              }
              onClick={() => {
                void submit(retrySubmission);
              }}
            >
              Retry request
            </Button>
          )}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogTitle>
            {action === "review"
              ? "Run a quality pass"
              : "Request specific fixes"}
          </DialogTitle>
          <DialogDescription>
            {action === "review"
              ? "Choose a focus and a small scope. You’ll get findings before any changes. Keep the scope to at most 10 files and 2 pages."
              : "Name the finding IDs or describe the fixes you want. Only these changes will be requested."}
          </DialogDescription>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (scope.trim())
                void submit({ focus, action, scope: scope.trim() });
            }}
          >
            {action === "review" && (
              <fieldset className="flex flex-wrap gap-2">
                <legend className="mb-2 text-sm font-medium">
                  Review focus
                </legend>
                {(
                  Object.keys(
                    QUALITY_REVIEW_LABELS,
                  ) as QualityReviewSubmission["focus"][]
                ).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant={focus === value ? "secondary" : "outline"}
                    aria-pressed={focus === value}
                    onClick={() => setFocus(value)}
                  >
                    {QUALITY_REVIEW_LABELS[value]}
                  </Button>
                ))}
              </fieldset>
            )}
            <div className="space-y-2">
              <label
                htmlFor="quality-review-scope"
                className="text-sm font-medium"
              >
                {action === "review"
                  ? "Pages or files to review"
                  : "Requested fixes"}
              </label>
              <Textarea
                id="quality-review-scope"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                maxLength={2000}
                required
                rows={4}
                placeholder={
                  action === "review"
                    ? "Review the checkout page. Preview: http://localhost:3000/checkout"
                    : "Fix F1 and F3; keep the current visual design."
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  disabled ||
                  sending ||
                  !scope.trim() ||
                  (action === "fix" && (fixBlocked || !hasReport))
                }
              >
                {action === "review"
                  ? "Review without editing"
                  : "Apply requested fixes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
