const IMAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Derive a pathname-safe image id from a tool call id. */
export function toScreenshotImageId(toolCallId: string): string {
  const sanitized = toolCallId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128);
  return sanitized.length > 0 ? sanitized : "screenshot";
}

export function isScreenshotImageId(value: string): boolean {
  return IMAGE_ID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Collect screenshot image ids referenced by task tool outputs in persisted
 * message parts. Walks the structure so it does not depend on UI part shapes.
 */
export function collectScreenshotImageIds(
  value: unknown,
  ids = new Set<string>(),
): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectScreenshotImageIds(item, ids);
    }
    return ids;
  }

  if (!isRecord(value)) {
    return ids;
  }

  const screenshots = value.screenshots;
  if (Array.isArray(screenshots)) {
    for (const screenshot of screenshots) {
      if (
        isRecord(screenshot) &&
        typeof screenshot.imageId === "string" &&
        isScreenshotImageId(screenshot.imageId)
      ) {
        ids.add(screenshot.imageId);
      }
    }
  }

  for (const [key, child] of Object.entries(value)) {
    if (key !== "screenshots" && typeof child === "object") {
      collectScreenshotImageIds(child, ids);
    }
  }
  return ids;
}
