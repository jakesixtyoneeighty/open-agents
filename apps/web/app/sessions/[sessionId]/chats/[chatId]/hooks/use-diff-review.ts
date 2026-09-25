"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { DiffFile } from "@/app/api/sessions/[sessionId]/diff/route";
import {
  getDiffReviewStorage,
  isFileReviewed,
  readReviewedFiles,
  type ReviewedFiles,
  setFileReviewed,
  writeReviewedFiles,
} from "@/lib/diff-review-storage";

// The diff view and the git panel both read review marks, so writes notify
// every mounted hook. Other tabs are picked up through the `storage` event.
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

// Snapshots must be referentially stable between renders, so the store
// exposes the raw stored string and parsing happens in a memo.
function readSnapshot(sessionId: string): string {
  return JSON.stringify(readReviewedFiles(getDiffReviewStorage(), sessionId));
}

const EMPTY_SNAPSHOT = "{}";

export interface DiffReviewState {
  reviewedPaths: ReadonlySet<string>;
  setReviewed: (file: DiffFile, reviewed: boolean) => void;
}

/**
 * Reviewed marks for the session's changed files. A file counts as reviewed
 * only while its change matches the reviewed fingerprint; any edit clears it.
 */
export function useDiffReview(
  sessionId: string | undefined,
  files: readonly DiffFile[],
): DiffReviewState {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => (sessionId ? readSnapshot(sessionId) : EMPTY_SNAPSHOT),
    () => EMPTY_SNAPSHOT,
  );

  const reviewed = useMemo<ReviewedFiles>(() => {
    try {
      return JSON.parse(snapshot) as ReviewedFiles;
    } catch {
      return {};
    }
  }, [snapshot]);

  const reviewedPaths = useMemo(
    () =>
      new Set(
        files
          .filter((file) => isFileReviewed(reviewed, file))
          .map((file) => file.path),
      ),
    [files, reviewed],
  );

  const setReviewed = useCallback(
    (file: DiffFile, isReviewed: boolean) => {
      if (!sessionId) return;
      const storage = getDiffReviewStorage();
      const current = readReviewedFiles(storage, sessionId);
      writeReviewedFiles(
        storage,
        sessionId,
        setFileReviewed(current, files, file, isReviewed),
      );
      notify();
    },
    [sessionId, files],
  );

  return { reviewedPaths, setReviewed };
}
