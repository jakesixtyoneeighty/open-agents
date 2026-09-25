"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDraftStorage,
  readChatDraft,
  resolveDraftSubmission,
  writeChatDraft,
} from "@/lib/chat-draft-storage";

type UseChatDraftParams = {
  chatId: string;
  input: string;
  setInput: (value: string) => void;
  /** AI SDK chat status: "submitted" | "streaming" | "ready" | "error". */
  status: string;
  /** Pause persistence, e.g. while the textarea is answering a question. */
  enabled: boolean;
};

type HeldSubmission = {
  text: string;
  sawInFlight: boolean;
};

/**
 * Persists the composer text per chat so it survives navigation and refresh.
 * A submitted message's draft is held until the server accepts it; if the
 * send fails, the text is restored to the composer.
 */
export function useChatDraft({
  chatId,
  input,
  setInput,
  status,
  enabled,
}: UseChatDraftParams) {
  const restoredChatIdRef = useRef<string | null>(null);
  // The commit that restores a draft still sees the previous input value.
  const skipPersistRef = useRef(false);
  const [held, setHeld] = useState<HeldSubmission | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;

  // Restore once per chat, before persistence starts writing.
  useEffect(() => {
    if (restoredChatIdRef.current === chatId) return;
    const isChatSwitch = restoredChatIdRef.current !== null;
    restoredChatIdRef.current = chatId;
    skipPersistRef.current = true;
    setHeld(null);

    const draft = readChatDraft(getDraftStorage(), chatId);
    if (isChatSwitch) {
      // Never carry the previous chat's text into this one.
      setInput(draft ?? "");
    } else if (draft && inputRef.current.length === 0) {
      setInput(draft);
    }
  }, [chatId, setInput]);

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    if (!enabled || restoredChatIdRef.current !== chatId) return;
    // Keep the submitted text stored while its send is unconfirmed.
    if (held && input.length === 0) return;
    writeChatDraft(getDraftStorage(), chatId, input);
  }, [chatId, enabled, held, input]);

  useEffect(() => {
    if (!held) return;

    const sawInFlight =
      held.sawInFlight || status === "submitted" || status === "streaming";
    const outcome = resolveDraftSubmission(status, sawInFlight);

    if (outcome === "pending") {
      if (sawInFlight !== held.sawInFlight) {
        setHeld({ ...held, sawInFlight });
      }
      return;
    }

    setHeld(null);
    const storage = getDraftStorage();
    if (outcome === "accepted") {
      writeChatDraft(storage, chatId, inputRef.current);
      return;
    }

    if (inputRef.current.length === 0) {
      setInput(held.text);
    }
  }, [chatId, held, setInput, status]);

  /** Call right before clearing the composer for a send. */
  const holdForSubmission = useCallback((text: string) => {
    setHeld({ text, sawInFlight: false });
  }, []);

  /** Call when the send throws before the request starts. */
  const restoreAfterFailure = useCallback(
    (text: string) => {
      setHeld(null);
      if (inputRef.current.length === 0) {
        setInput(text);
      }
    },
    [setInput],
  );

  return { holdForSubmission, restoreAfterFailure };
}
