"use client";

import type { TaskScreenshot } from "@open-agents/agent";
import { AlertTriangle, Camera, CircleX, ImageOff } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  getScreenshotIssues,
  groupScreenshots,
  type ScreenshotPage,
  type ScreenshotShot,
} from "./group-screenshots";
import { useScreenshotUrl } from "./screenshot-source-context";

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shotLabel(shot: Pick<ScreenshotShot, "viewport" | "colorScheme">) {
  const viewport = capitalize(shot.viewport);
  return shot.colorScheme === "dark" ? `${viewport} · dark` : viewport;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function ScreenshotImage({
  screenshot,
  alt,
  className,
}: {
  screenshot: TaskScreenshot;
  alt: string;
  className?: string;
}) {
  const resolveUrl = useScreenshotUrl();
  const [failed, setFailed] = useState(false);
  const src =
    screenshot.imageId && resolveUrl ? resolveUrl(screenshot.imageId) : null;

  if (!src || failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted/40 text-muted-foreground",
          className,
        )}
      >
        <ImageOff className="h-4 w-4" aria-hidden />
        <span className="sr-only">{alt} (image unavailable)</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Private, cookie-authenticated route; next/image would fetch it without the viewer's session
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      ref={(img) => {
        // A load error before hydration never reaches onError.
        if (img?.complete && img.naturalWidth === 0) {
          setFailed(true);
        }
      }}
      onError={() => setFailed(true)}
      className={cn("bg-muted/40", className)}
    />
  );
}

function IssueList({ screenshot }: { screenshot: TaskScreenshot }) {
  const issues = getScreenshotIssues(screenshot);
  if (issues.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-1 text-xs">
      {issues.map((issue) => (
        <li
          key={issue.kind}
          className={cn(
            "flex items-start gap-1.5",
            issue.kind === "not-stored"
              ? "text-muted-foreground"
              : "text-red-600 dark:text-red-400",
          )}
        >
          {issue.kind === "failed" ? (
            <CircleX className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          )}
          <span className="break-words">{issue.message}</span>
        </li>
      ))}
      {screenshot.consoleErrors && screenshot.consoleErrors.length > 0 && (
        <li>
          <details className="text-muted-foreground">
            <summary className="cursor-pointer select-none">
              Show console errors
            </summary>
            <ul className="mt-1 space-y-1 font-mono text-[11px]">
              {screenshot.consoleErrors.map((message, index) => (
                <li
                  // Console messages can repeat; position is the identity.
                  key={index}
                  className="break-words rounded bg-muted/50 px-2 py-1"
                >
                  {message}
                </li>
              ))}
            </ul>
          </details>
        </li>
      )}
    </ul>
  );
}

function ShotThumbnail({
  page,
  shot,
  onOpen,
}: {
  page: ScreenshotPage;
  shot: ScreenshotShot;
  onOpen: () => void;
}) {
  const { latest } = shot;
  const issues = getScreenshotIssues(latest);
  const hasProblem = issues.some((issue) => issue.kind !== "not-stored");
  const isMobile = shot.viewport === "mobile";

  return (
    <li className="shrink-0">
      <button
        type="button"
        onClick={onOpen}
        className="group flex flex-col gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${shotLabel(shot)} screenshot of ${page.label}`}
      >
        <div
          className={cn(
            "relative h-28 overflow-hidden rounded-md border border-border transition-colors group-hover:border-foreground/30",
            isMobile ? "w-16" : "w-44",
          )}
        >
          {latest.error ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-red-500/5 px-2 text-center text-red-600 dark:text-red-400">
              <CircleX className="h-4 w-4" aria-hidden />
              <span className="text-[11px] leading-tight">Failed</span>
            </div>
          ) : (
            <ScreenshotImage
              screenshot={latest}
              alt={`${shotLabel(shot)} screenshot of ${page.label}`}
              className="h-full w-full object-cover object-top"
            />
          )}
        </div>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {hasProblem && (
            <AlertTriangle
              className="h-3 w-3 text-red-600 dark:text-red-400"
              aria-label="Has issues"
            />
          )}
          {shotLabel(shot)}
          {shot.attempts.length > 1 && (
            <span className="font-mono text-muted-foreground/60">
              ×{shot.attempts.length}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function ComparisonView({ shot }: { shot: ScreenshotShot }) {
  if (!shot.comparison) {
    return null;
  }
  const { before, after } = shot.comparison;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        { label: "Before", screenshot: before },
        { label: "After", screenshot: after },
      ].map(({ label, screenshot }) => (
        <figure key={label} className="min-w-0 space-y-1.5">
          <figcaption className="flex items-baseline justify-between text-xs">
            <span className="font-medium">{label}</span>
            <span className="font-mono text-muted-foreground">
              {formatTime(screenshot.capturedAt)}
            </span>
          </figcaption>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border">
            <ScreenshotImage
              screenshot={screenshot}
              alt={`${label} screenshot`}
              className="h-auto w-full"
            />
          </div>
        </figure>
      ))}
    </div>
  );
}

function ShotDialog({
  page,
  shot,
  onClose,
}: {
  page: ScreenshotPage;
  shot: ScreenshotShot;
  onClose: () => void;
}) {
  const [view, setView] = useState<"latest" | "compare">("latest");
  const { latest } = shot;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-x-2 font-mono text-sm">
            {page.label}
            <span className="font-sans text-muted-foreground">
              {shotLabel(shot)}
            </span>
          </DialogTitle>
          <DialogDescription className="break-all text-xs">
            {page.title ? `${page.title} · ` : ""}
            {latest.url}
          </DialogDescription>
        </DialogHeader>

        {shot.comparison && (
          <div
            role="tablist"
            aria-label="Screenshot view"
            className="inline-flex w-fit rounded-md border border-border p-0.5 text-xs"
          >
            {(
              [
                ["latest", "Latest"],
                ["compare", "Before / after"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={view === value}
                onClick={() => setView(value)}
                className={cn(
                  "rounded px-2.5 py-1 transition-colors",
                  view === value
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {view === "compare" && shot.comparison ? (
          <ComparisonView shot={shot} />
        ) : latest.error ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3">
            <IssueList screenshot={latest} />
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border">
            <ScreenshotImage
              screenshot={latest}
              alt={`${shotLabel(shot)} screenshot of ${page.label}`}
              className="h-auto w-full"
            />
          </div>
        )}

        <section aria-label="Capture history" className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {shot.attempts.length === 1
              ? "1 capture"
              : `${shot.attempts.length} captures`}
          </h3>
          <ol className="space-y-2">
            {[...shot.attempts].toReversed().map((attempt) => (
              <li
                key={attempt.toolCallId}
                className="space-y-1 rounded-md border border-border px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 font-mono text-xs text-muted-foreground">
                  <span>{formatTime(attempt.capturedAt)}</span>
                  {typeof attempt.status === "number" && (
                    <span>HTTP {attempt.status}</span>
                  )}
                  {attempt.width && attempt.height ? (
                    <span>
                      {attempt.width}×{attempt.height}
                    </span>
                  ) : null}
                  {attempt.fullPage && <span>full page</span>}
                </div>
                <IssueList screenshot={attempt} />
              </li>
            ))}
          </ol>
        </section>
      </DialogContent>
    </Dialog>
  );
}

export function ScreenshotGallery({
  screenshots,
}: {
  screenshots: readonly TaskScreenshot[];
}) {
  const pages = useMemo(() => groupScreenshots(screenshots), [screenshots]);
  const [openShotKey, setOpenShotKey] = useState<string | null>(null);

  if (pages.length === 0) {
    return null;
  }

  const failedCount = screenshots.filter((shot) => shot.error).length;
  const openPage = pages.find((page) =>
    page.shots.some((shot) => shot.key === openShotKey),
  );
  const openShot = openPage?.shots.find((shot) => shot.key === openShotKey);

  return (
    <section
      aria-label="Screenshots from this run"
      className="mt-2 ml-5 space-y-3 rounded-md border border-border p-3"
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <Camera className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="font-medium">Screenshots</span>
        <span className="font-mono text-muted-foreground/70">
          {screenshots.length} capture{screenshots.length === 1 ? "" : "s"} ·{" "}
          {pages.length} page{pages.length === 1 ? "" : "s"}
        </span>
        {failedCount > 0 && (
          <span className="text-red-600 dark:text-red-400">
            {failedCount} failed
          </span>
        )}
      </header>

      {pages.map((page) => (
        <div key={page.key} className="min-w-0 space-y-1.5">
          <div className="flex min-w-0 items-baseline gap-2 text-xs">
            <span className="max-w-full shrink-0 truncate font-mono sm:max-w-[60%]">
              {page.label}
            </span>
            {page.title && (
              <span className="truncate text-muted-foreground">
                {page.title}
              </span>
            )}
          </div>
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {page.shots.map((shot) => (
              <ShotThumbnail
                key={shot.key}
                page={page}
                shot={shot}
                onOpen={() => setOpenShotKey(shot.key)}
              />
            ))}
          </ul>
        </div>
      ))}

      {openPage && openShot && (
        <ShotDialog
          key={openShot.key}
          page={openPage}
          shot={openShot}
          onClose={() => setOpenShotKey(null)}
        />
      )}
    </section>
  );
}
