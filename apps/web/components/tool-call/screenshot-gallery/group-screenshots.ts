import type { TaskScreenshot } from "@open-agents/agent";

export type ScreenshotShot = {
  /** Stable key for one viewport + color scheme of a page. */
  key: string;
  viewport: string;
  colorScheme: "light" | "dark";
  /** Every attempt for this shot in capture order, failures included. */
  attempts: TaskScreenshot[];
  /** The most recent attempt. */
  latest: TaskScreenshot;
  /** Earliest and latest stored images, present only when both exist and differ. */
  comparison: { before: TaskScreenshot; after: TaskScreenshot } | null;
};

export type ScreenshotPage = {
  key: string;
  /** Short page label, e.g. "/pricing" or "localhost:3000". */
  label: string;
  /** Latest non-empty document title for the page, if any. */
  title: string | null;
  shots: ScreenshotShot[];
};

const VIEWPORT_ORDER = ["desktop", "tablet", "mobile"];

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Group key for a page: origin + path, ignoring hash and trailing slash. */
function pageKey(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) {
    return url;
  }
  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  return `${parsed.origin}${path}${parsed.search}`;
}

export function pageLabel(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) {
    return url;
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  return path ? `${path}${parsed.search}` : parsed.host;
}

function viewportRank(viewport: string): number {
  const index = VIEWPORT_ORDER.indexOf(viewport);
  return index === -1 ? VIEWPORT_ORDER.length : index;
}

function buildShot(key: string, attempts: TaskScreenshot[]): ScreenshotShot {
  const [first] = attempts;
  const latest = attempts.at(-1) ?? first;
  if (!first || !latest) {
    throw new Error("A screenshot shot needs at least one attempt");
  }

  const stored = attempts.filter((attempt) => attempt.imageId);
  const before = stored.at(0);
  const after = stored.at(-1);

  return {
    key,
    viewport: first.viewport,
    colorScheme: first.colorScheme,
    attempts,
    latest,
    comparison:
      before && after && before.toolCallId !== after.toolCallId
        ? { before, after }
        : null,
  };
}

/**
 * Group a run's captures by page, then by viewport and color scheme. Pages
 * keep first-capture order; shots within a page go desktop → tablet → mobile.
 */
export function groupScreenshots(
  screenshots: readonly TaskScreenshot[],
): ScreenshotPage[] {
  const ordered = [...screenshots].sort((a, b) => a.capturedAt - b.capturedAt);
  const pages = new Map<string, Map<string, TaskScreenshot[]>>();
  const pageUrls = new Map<string, string>();

  for (const screenshot of ordered) {
    const key = pageKey(screenshot.url);
    if (!pages.has(key)) {
      pages.set(key, new Map());
      pageUrls.set(key, screenshot.url);
    }
    const shots = pages.get(key);
    const shotKey = `${screenshot.viewport}:${screenshot.colorScheme}`;
    const attempts = shots?.get(shotKey) ?? [];
    attempts.push(screenshot);
    shots?.set(shotKey, attempts);
  }

  return [...pages.entries()].map(([key, shots]) => {
    const builtShots = [...shots.entries()]
      .map(([shotKey, attempts]) => buildShot(`${key}|${shotKey}`, attempts))
      .sort(
        (a, b) =>
          viewportRank(a.viewport) - viewportRank(b.viewport) ||
          // Light first: it is the default capture.
          b.colorScheme.localeCompare(a.colorScheme),
      );
    const title =
      builtShots
        .flatMap((shot) => shot.attempts)
        .sort((a, b) => b.capturedAt - a.capturedAt)
        .find((attempt) => attempt.title?.trim())
        ?.title?.trim() ?? null;

    return {
      key,
      label: pageLabel(pageUrls.get(key) ?? key),
      title,
      shots: builtShots,
    };
  });
}

export type ScreenshotIssue = {
  kind: "failed" | "http" | "console" | "not-stored";
  message: string;
};

/** Problems worth surfacing for a single capture attempt. */
export function getScreenshotIssues(
  screenshot: TaskScreenshot,
): ScreenshotIssue[] {
  if (screenshot.error) {
    return [{ kind: "failed", message: screenshot.error }];
  }

  const issues: ScreenshotIssue[] = [];
  if (typeof screenshot.status === "number" && screenshot.status >= 400) {
    issues.push({ kind: "http", message: `HTTP ${screenshot.status}` });
  }
  const consoleErrorCount = screenshot.consoleErrors?.length ?? 0;
  if (consoleErrorCount > 0) {
    issues.push({
      kind: "console",
      message: `${consoleErrorCount} console error${consoleErrorCount === 1 ? "" : "s"}`,
    });
  }
  if (!screenshot.imageId) {
    issues.push({
      kind: "not-stored",
      message: screenshot.storageError ?? "Image was not saved",
    });
  }
  return issues;
}
