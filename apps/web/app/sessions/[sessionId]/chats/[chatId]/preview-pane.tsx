"use client";

import {
  ExternalLink,
  Loader2,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  computePreviewScale,
  getPreviewViewport,
  PREVIEW_VIEWPORTS,
  type PreviewViewportId,
  resolvePreviewFrameUrl,
} from "@/lib/preview/preview-frame";
import { cn } from "@/lib/utils";
import type { PreviewPaneControls } from "./hooks/use-preview-pane";

// Cross-origin frames give no signal when the app refuses to be framed, so
// after this long the pane suggests opening the preview in a new tab.
const SLOW_LOAD_HINT_MS = 8000;

const VIEWPORT_ICONS: Record<PreviewViewportId, ReactNode> = {
  fit: <span className="text-[10px] font-medium">Fit</span>,
  mobile: <Smartphone className="h-3.5 w-3.5" />,
  tablet: <Tablet className="h-3.5 w-3.5" />,
  desktop: <Monitor className="h-3.5 w-3.5" />,
};

function openExternally(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function usePaneWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/**
 * The session's dev server beside the chat. On wide screens it sits next to
 * the chat; below `lg` it covers the chat until closed.
 */
export function PreviewPane({ preview }: { preview: PreviewPaneControls }) {
  const { url, viewportId, reloadKey } = preview;
  const [appOrigin, setAppOrigin] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const { ref: paneRef, width: paneWidth } = usePaneWidth();

  useEffect(() => {
    setAppOrigin(window.location.origin);
  }, []);

  // Reset load tracking for every new document.
  useEffect(() => {
    setLoaded(false);
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), SLOW_LOAD_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [url, reloadKey]);

  if (!url) return null;

  const frame = appOrigin ? resolvePreviewFrameUrl(url, appOrigin) : null;
  const viewport = getPreviewViewport(viewportId);
  const scale = computePreviewScale(paneWidth, viewport.width);
  const host = frame?.ok ? new URL(frame.url).host : url;

  return (
    <section
      aria-label="Dev server preview"
      className="absolute inset-0 z-20 flex min-w-0 flex-col bg-background lg:relative lg:inset-auto lg:z-auto lg:w-[45%] lg:min-w-[360px] lg:max-w-[70%] lg:border-l lg:border-border"
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        <span
          className="min-w-0 flex-1 truncate px-1 font-mono text-xs text-muted-foreground"
          title={url}
        >
          {host}
        </span>
        <div
          role="radiogroup"
          aria-label="Preview width"
          className="flex items-center rounded-md border border-border p-0.5"
        >
          {PREVIEW_VIEWPORTS.map((option) => (
            <Tooltip key={option.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={viewportId === option.id}
                  aria-label={
                    option.width
                      ? `${option.label} (${option.width}px)`
                      : "Fit to pane"
                  }
                  onClick={() => preview.handleViewportChange(option.id)}
                  className={cn(
                    "flex h-6 min-w-6 items-center justify-center rounded-sm px-1 transition-colors",
                    viewportId === option.id
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {VIEWPORT_ICONS[option.id]}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {option.width
                  ? `${option.label} · ${option.width}px`
                  : "Fit to pane"}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={preview.handleReload}
              aria-label="Reload preview"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Reload</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => openExternally(url)}
              aria-label="Open preview in a new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Open in new tab</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={preview.handleClose}
              aria-label="Close preview"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Close preview</TooltipContent>
        </Tooltip>
      </div>

      <div
        ref={paneRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-muted/30"
      >
        {frame && !frame.ok ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              {frame.reason === "same-origin"
                ? "This address can't be previewed here because it shares the app's origin."
                : "This address can't be previewed here."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openExternally(url)}
            >
              <ExternalLink />
              Open in new tab
            </Button>
          </div>
        ) : frame?.ok ? (
          <>
            <div
              className="absolute left-1/2 top-0 h-full origin-top"
              style={{
                width: viewport.width ? `${viewport.width}px` : "100%",
                height: scale < 1 ? `${100 / scale}%` : "100%",
                transform: `translateX(-50%) scale(${scale})`,
              }}
            >
              {/* oxlint-disable react/iframe-missing-sandbox -- the frame is always a different origin (enforced by resolvePreviewFrameUrl), so allow-same-origin keeps the app's own origin, not ours */}
              <iframe
                key={`${frame.url}-${reloadKey}`}
                src={frame.url}
                title="Dev server preview"
                className={cn(
                  "h-full w-full border-0 bg-white",
                  viewport.width && "shadow-sm ring-1 ring-border",
                )}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                referrerPolicy="no-referrer"
                onLoad={() => setLoaded(true)}
              />
              {/* oxlint-enable react/iframe-missing-sandbox */}
            </div>
            {!loaded ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 px-6 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                {slow ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Still loading. Some apps refuse to load inside another
                      page.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openExternally(url)}
                    >
                      <ExternalLink />
                      Open in new tab
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
