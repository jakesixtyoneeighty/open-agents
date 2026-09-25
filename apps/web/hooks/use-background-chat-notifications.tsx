"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { SessionWithUnread } from "@/hooks/use-sessions";
import { collectNewOutcomes, OUTCOME_LABELS } from "@/lib/chat/outcome";

function playOutcomeSound() {
  if (typeof window === "undefined" || typeof window.Audio === "undefined")
    return;
  const audio = new window.Audio("/Submarine.wav");
  audio.play().catch(() => undefined);
}

/** Announce persisted run outcomes, never infer success from stream disappearance. */
export function useBackgroundChatNotifications(
  sessions: SessionWithUnread[],
  activeSessionId: string | null,
  onNavigateToSession: (session: SessionWithUnread) => void,
  options?: { alertsEnabled?: boolean; alertSoundEnabled?: boolean },
) {
  const alertsEnabled = options?.alertsEnabled ?? true;
  const alertSoundEnabled = options?.alertSoundEnabled ?? true;
  const seenRef = useRef(new Set<string>());
  const mountedAt = useRef(Date.now());
  const navigateRef = useRef(onNavigateToSession);
  navigateRef.current = onNavigateToSession;

  useEffect(() => {
    let announced = false;
    for (const session of sessions) {
      for (const outcome of collectNewOutcomes(
        seenRef.current,
        session.chatOutcomes ?? [],
      )) {
        seenRef.current.add(outcome.runId);
        if (
          Date.parse(outcome.finishedAt) < mountedAt.current ||
          session.id === activeSessionId ||
          !alertsEnabled
        )
          continue;
        announced = true;
        toast(OUTCOME_LABELS[outcome.status], {
          description: session.title || "A session",
          position: "top-center",
          duration: 8000,
          action: {
            label: "Go to chat",
            onClick: () =>
              navigateRef.current({ ...session, latestChatId: outcome.chatId }),
          },
        });
      }
    }
    if (announced && alertSoundEnabled) playOutcomeSound();
  }, [sessions, activeSessionId, alertsEnabled, alertSoundEnabled]);
}
