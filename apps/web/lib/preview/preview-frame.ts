/**
 * Rules for showing a sandbox dev server beside the chat. The frame always
 * loads the sandbox's own origin, never one proxied through the app, so the
 * previewed app stays isolated from the app's cookies and storage.
 */

export type PreviewViewportId = "fit" | "mobile" | "tablet" | "desktop";

export interface PreviewViewport {
  id: PreviewViewportId;
  label: string;
  /** CSS pixel width the page is laid out at; null fills the pane. */
  width: number | null;
}

export const PREVIEW_VIEWPORTS: readonly PreviewViewport[] = [
  { id: "fit", label: "Fit", width: null },
  { id: "mobile", label: "Mobile", width: 390 },
  { id: "tablet", label: "Tablet", width: 768 },
  { id: "desktop", label: "Desktop", width: 1280 },
];

export function getPreviewViewport(id: PreviewViewportId): PreviewViewport {
  return (
    PREVIEW_VIEWPORTS.find((viewport) => viewport.id === id) ?? {
      id: "fit",
      label: "Fit",
      width: null,
    }
  );
}

export type PreviewFrameUrlResult =
  | { ok: true; url: string; origin: string }
  | { ok: false; reason: "invalid" | "insecure" | "same-origin" };

/**
 * Accepts only absolute https URLs on an origin other than the app's.
 * A same-origin frame with scripts and same-origin sandbox flags could reach
 * the app itself, so it is refused rather than framed.
 */
export function resolvePreviewFrameUrl(
  value: string,
  appOrigin: string,
): PreviewFrameUrlResult {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "insecure" };
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "invalid" };
  }

  let app: URL | null = null;
  try {
    app = new URL(appOrigin);
  } catch {
    app = null;
  }
  if (app && parsed.origin === app.origin) {
    return { ok: false, reason: "same-origin" };
  }
  return { ok: true, url: parsed.toString(), origin: parsed.origin };
}

/**
 * Scale for laying a fixed-width viewport into a narrower pane. Never scales
 * up, and falls back to 1 before the pane has been measured.
 */
export function computePreviewScale(
  paneWidth: number,
  viewportWidth: number | null,
): number {
  if (viewportWidth === null || viewportWidth <= 0 || paneWidth <= 0) return 1;
  return Math.min(1, paneWidth / viewportWidth);
}
