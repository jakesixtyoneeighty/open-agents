import type { ScreenshotStore } from "@open-agents/agent";
import { del, get, list, put } from "@vercel/blob";
import { isScreenshotImageId, toScreenshotImageId } from "./image-id";

const PATHNAME_PREFIX = "screenshots";

/**
 * Screenshots are stored in private Blob, keyed by session so forked chats
 * (which copy messages within a session) keep resolving the same images.
 */
function sessionPrefix(sessionId: string): string {
  return `${PATHNAME_PREFIX}/${sessionId}/`;
}

function screenshotPathname(sessionId: string, imageId: string): string {
  return `${sessionPrefix(sessionId)}${imageId}.jpg`;
}

export function isScreenshotStorageConfigured(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID,
  );
}

export function createScreenshotStore(
  sessionId: string,
): ScreenshotStore | undefined {
  if (!isScreenshotStorageConfigured()) {
    return undefined;
  }

  return {
    async save({ toolCallId, image, mediaType }) {
      const imageId = toScreenshotImageId(toolCallId);
      await put(screenshotPathname(sessionId, imageId), image, {
        access: "private",
        contentType: mediaType,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return { imageId };
    },
  };
}

export async function getScreenshot(sessionId: string, imageId: string) {
  if (!isScreenshotStorageConfigured() || !isScreenshotImageId(imageId)) {
    return null;
  }

  const result = await get(screenshotPathname(sessionId, imageId), {
    access: "private",
  });
  return result?.statusCode === 200 ? result : null;
}

export async function deleteScreenshots(
  sessionId: string,
  imageIds: Iterable<string>,
): Promise<void> {
  if (!isScreenshotStorageConfigured()) {
    return;
  }

  const pathnames = [...imageIds]
    .filter(isScreenshotImageId)
    .map((imageId) => screenshotPathname(sessionId, imageId));
  if (pathnames.length > 0) {
    await del(pathnames);
  }
}

export async function deleteSessionScreenshots(
  sessionId: string,
): Promise<void> {
  if (!isScreenshotStorageConfigured()) {
    return;
  }

  let cursor: string | undefined;
  do {
    const page = await list({ prefix: sessionPrefix(sessionId), cursor });
    if (page.blobs.length > 0) {
      await del(page.blobs.map((blob) => blob.pathname));
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}
