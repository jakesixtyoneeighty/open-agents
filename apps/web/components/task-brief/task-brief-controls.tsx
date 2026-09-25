"use client";

import { ClipboardList, Play } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  getTaskBriefState,
  taskBriefMessageText,
  type TaskBrief,
  type TaskBriefSubmission,
} from "@/lib/task-brief";
import { TaskBriefEditor } from "./task-brief-editor";

export function TaskBriefControls({
  messages,
  disabled,
  buildBlocked = false,
  onSend,
}: {
  messages: WebAgentUIMessage[];
  disabled: boolean;
  buildBlocked?: boolean;
  onSend: (message: { parts: WebAgentUIMessage["parts"] }) => Promise<void>;
}) {
  const current = useMemo(() => getTaskBriefState(messages), [messages]);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryBrief, setRetryBrief] = useState<TaskBrief | undefined>();
  const sendingRef = useRef(false);
  const planning = current?.action === "plan";
  const lastMessage = messages.at(-1);
  const hasPlanResponse =
    lastMessage?.role === "assistant" &&
    lastMessage.metadata?.lastStepFinishReason === "stop" &&
    lastMessage.parts.some(
      (part) => part.type === "text" && part.text.trim().length > 0,
    );

  const submit = async (submission: TaskBriefSubmission) => {
    if (disabled || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    setRetryBrief(submission.brief);
    setOpen(false);
    try {
      await onSend({
        parts: [
          { type: "text", text: taskBriefMessageText(submission) },
          { type: "data-task-brief", data: submission },
        ],
      });
      setRetryBrief(undefined);
    } catch {
      setError("Could not send the brief. Please try again.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <div className="mb-2 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={disabled || sending}
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          <ClipboardList className="size-3.5" />
          {current ? "Edit brief" : "Task brief"}
        </Button>
        {planning && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Planning · review or refine in chat
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={disabled || sending || !hasPlanResponse || buildBlocked}
              onClick={() => {
                void submit({ ...current, action: "build" });
              }}
            >
              <Play className="size-3.5" />
              Build this plan
            </Button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-2xl">
          <TaskBriefEditor
            initialBrief={retryBrief ?? current?.brief}
            disabled={disabled || sending}
            error={error}
            onCancel={() => setOpen(false)}
            onSubmit={(brief) => {
              void submit({ brief, action: "plan" });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
