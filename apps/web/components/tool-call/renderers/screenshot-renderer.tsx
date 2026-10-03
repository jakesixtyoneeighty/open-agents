"use client";

import type { ToolRendererProps } from "@/app/lib/render-tool";
import type { TaskScreenshot } from "@open-agents/agent";
import { ScreenshotGallery } from "../screenshot-gallery/screenshot-gallery";
import { ToolLayout } from "../tool-layout";

export function ScreenshotRenderer({
  part,
  state,
}: ToolRendererProps<"tool-screenshot">) {
  const result = part.state === "output-available" ? part.output : undefined;
  const input = part.input;
  const screenshot: TaskScreenshot | undefined =
    result && input?.url
      ? {
          toolCallId: part.toolCallId,
          url: input.url,
          viewport: input.viewport ?? "desktop",
          colorScheme: input.colorScheme ?? "light",
          fullPage: input.fullPage ?? false,
          capturedAt: result.success ? (result.capturedAt ?? 0) : 0,
          ...(result.success
            ? {
                imageId: result.imageId,
                storageError: result.storageError,
                status: result.status,
                title: result.title,
                width: result.width,
                height: result.height,
                consoleErrors: result.consoleErrors,
              }
            : { error: result.error }),
        }
      : undefined;
  return (
    <ToolLayout
      name="Screenshot"
      summary={input?.url ?? "Capturing page"}
      state={
        result?.success === false ? { ...state, error: result.error } : state
      }
      expandedContent={
        screenshot ? (
          <ScreenshotGallery screenshots={[screenshot]} />
        ) : undefined
      }
    />
  );
}
