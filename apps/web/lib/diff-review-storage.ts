/**
 * Per-session diff review progress. Reviewed marks live in the viewer's
 * browser only. Each mark stores a fingerprint of the file's change against
 * the base branch, so any later edit to the file invalidates the mark while
 * committing (which leaves that change unchanged) keeps it.
 */

import type { DiffFile } from "@/lib/diff/compute-diff";

export type DiffReviewStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

/** Reviewed file path -> fingerprint of the change that was reviewed. */
export type ReviewedFiles = Record<string, string>;

type FingerprintSource = Pick<
  DiffFile,
  "path" | "status" | "additions" | "deletions" | "diff" | "oldPath"
>;

const REVIEW_KEY_PREFIX = "open-agents:diff-review:";

function getReviewKey(sessionId: string): string {
  return `${REVIEW_KEY_PREFIX}${sessionId}`;
}

/** Returns browser localStorage, or null when unavailable (SSR, blocked). */
export function getDiffReviewStorage(): DiffReviewStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** 53-bit string hash (cyrb53). Detects edits; not a security boundary. */
function hashString(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Fingerprints a file's change against the base branch. The full patch is
 * used regardless of the visible scope, so the mark is shared between the
 * uncommitted and branch views. Generated files have no patch content, so
 * their line counts and status stand in for it.
 */
export function getDiffFileFingerprint(file: FingerprintSource): string {
  return hashString(
    [
      file.status,
      file.oldPath ?? "",
      file.additions,
      file.deletions,
      file.diff,
    ].join("\u0000"),
  );
}

function isReviewedFiles(value: unknown): value is ReviewedFiles {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === "string");
}

export function readReviewedFiles(
  storage: DiffReviewStorage | null,
  sessionId: string,
): ReviewedFiles {
  if (!storage) return {};
  try {
    const raw = storage.getItem(getReviewKey(sessionId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isReviewedFiles(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Saves the marks, or removes the entry when nothing is reviewed. */
export function writeReviewedFiles(
  storage: DiffReviewStorage | null,
  sessionId: string,
  reviewed: ReviewedFiles,
): void {
  if (!storage) return;
  try {
    if (Object.keys(reviewed).length === 0) {
      storage.removeItem(getReviewKey(sessionId));
    } else {
      storage.setItem(getReviewKey(sessionId), JSON.stringify(reviewed));
    }
  } catch {
    // Quota exceeded or storage blocked: review marks are best-effort.
  }
}

export function clearReviewedFiles(
  storage: DiffReviewStorage | null,
  sessionId: string,
): void {
  writeReviewedFiles(storage, sessionId, {});
}

/** True when the file was reviewed and has not changed since. */
export function isFileReviewed(
  reviewed: ReviewedFiles,
  file: FingerprintSource,
): boolean {
  const mark = reviewed[file.path];
  return mark !== undefined && mark === getDiffFileFingerprint(file);
}

/**
 * Returns the marks with this file set or cleared. Marks for files that are
 * no longer in the diff, or whose change has moved on, are dropped so storage
 * does not accumulate stale entries.
 */
export function setFileReviewed(
  reviewed: ReviewedFiles,
  files: readonly FingerprintSource[],
  file: FingerprintSource,
  isReviewed: boolean,
): ReviewedFiles {
  const next: ReviewedFiles = {};
  for (const candidate of files) {
    if (candidate.path === file.path) continue;
    if (isFileReviewed(reviewed, candidate)) {
      next[candidate.path] = getDiffFileFingerprint(candidate);
    }
  }
  if (isReviewed) {
    next[file.path] = getDiffFileFingerprint(file);
  }
  return next;
}

/**
 * Finds the next unreviewed path after `currentPath` in display order,
 * wrapping to the start. Without a current path it starts at the top.
 * Returns null when every file is reviewed.
 */
export function findNextUnreviewedPath(
  orderedPaths: readonly string[],
  reviewedPaths: ReadonlySet<string>,
  currentPath: string | null,
): string | null {
  const count = orderedPaths.length;
  if (count === 0) return null;
  const currentIndex = currentPath ? orderedPaths.indexOf(currentPath) : -1;
  for (let offset = 1; offset <= count; offset++) {
    const path = orderedPaths[(currentIndex + offset + count) % count];
    if (path !== undefined && !reviewedPaths.has(path)) return path;
  }
  return null;
}
