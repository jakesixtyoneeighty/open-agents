import { getScreenshot } from "./storage";

/**
 * Stream a stored screenshot. Callers must authorize access first. Images are
 * immutable once written, but responses stay `private` so shared caches never
 * hold them.
 */
export async function screenshotResponse(
  sessionId: string,
  imageId: string,
): Promise<Response> {
  const result = await getScreenshot(sessionId, imageId);
  if (!result) {
    return Response.json({ error: "Screenshot not found" }, { status: 404 });
  }

  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
