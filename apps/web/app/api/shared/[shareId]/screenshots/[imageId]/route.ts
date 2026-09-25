import { getChatById, getChatMessages } from "@/lib/db/sessions";
import { getShareByIdCached } from "@/lib/db/sessions-cache";
import {
  collectScreenshotImageIds,
  isScreenshotImageId,
} from "@/lib/screenshots/image-id";
import { screenshotResponse } from "@/lib/screenshots/response";

type RouteContext = {
  params: Promise<{ shareId: string; imageId: string }>;
};

const notFound = () =>
  Response.json({ error: "Screenshot not found" }, { status: 404 });

/**
 * GET /api/shared/:shareId/screenshots/:imageId
 * Public read-only access to screenshots referenced by the shared chat only,
 * never other chats in the same session.
 */
export async function GET(_req: Request, context: RouteContext) {
  const { shareId, imageId } = await context.params;
  if (!isScreenshotImageId(imageId)) {
    return notFound();
  }

  const share = await getShareByIdCached(shareId);
  if (!share) {
    return notFound();
  }

  const chat = await getChatById(share.chatId);
  if (!chat) {
    return notFound();
  }

  const messages = await getChatMessages(chat.id);
  const referencedIds = collectScreenshotImageIds(
    messages.map((message) => message.parts),
  );
  if (!referencedIds.has(imageId)) {
    return notFound();
  }

  return screenshotResponse(chat.sessionId, imageId);
}
