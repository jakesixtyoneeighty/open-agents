/**
 * Per-chat message draft persistence. Drafts live in the viewer's browser
 * only; they are keyed by chat id so text always returns to the chat it was
 * typed in.
 */

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const DRAFT_KEY_PREFIX = "open-agents:chat-draft:";

function getDraftKey(chatId: string): string {
  return `${DRAFT_KEY_PREFIX}${chatId}`;
}

/** Returns browser localStorage, or null when unavailable (SSR, blocked). */
export function getDraftStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readChatDraft(
  storage: DraftStorage | null,
  chatId: string,
): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(getDraftKey(chatId));
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Saves the draft, or removes it when the text is empty. */
export function writeChatDraft(
  storage: DraftStorage | null,
  chatId: string,
  text: string,
): void {
  if (!storage) return;
  try {
    if (text.length === 0) {
      storage.removeItem(getDraftKey(chatId));
    } else {
      storage.setItem(getDraftKey(chatId), text);
    }
  } catch {
    // Quota exceeded or storage blocked: drafts are best-effort.
  }
}

export function clearChatDraft(
  storage: DraftStorage | null,
  chatId: string,
): void {
  writeChatDraft(storage, chatId, "");
}

export type DraftSubmissionOutcome = "pending" | "accepted" | "failed";

/**
 * Decides what a held submission's draft should do given the chat status.
 * A submission is accepted once the server starts responding, or when the
 * request settles back to ready after having been in flight. Status is only
 * trusted after the request was seen in flight, so an error left over from a
 * previous turn doesn't count against the new submission.
 */
export function resolveDraftSubmission(
  status: string,
  sawInFlight: boolean,
): DraftSubmissionOutcome {
  if (status === "error") return sawInFlight ? "failed" : "pending";
  if (status === "streaming") return "accepted";
  if (status === "ready" && sawInFlight) return "accepted";
  return "pending";
}
