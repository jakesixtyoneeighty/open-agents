import { z } from "zod";

/**
 * Host-provided durable storage for screenshot images. The agent package stays
 * storage-agnostic: the host passes a store through the call options and the
 * screenshot tool hands each capture to it. Must not be serialized, so hosts
 * should attach it inside the step that runs the agent.
 */
export interface ScreenshotStore {
  save(params: {
    toolCallId: string;
    image: Buffer;
    mediaType: "image/jpeg";
  }): Promise<{ imageId: string }>;
}

function isScreenshotStore(value: unknown): value is ScreenshotStore {
  return (
    typeof value === "object" &&
    value !== null &&
    "save" in value &&
    typeof value.save === "function"
  );
}

export function getScreenshotStore(
  experimental_context: unknown,
): ScreenshotStore | undefined {
  if (
    typeof experimental_context !== "object" ||
    experimental_context === null ||
    !("screenshotStore" in experimental_context)
  ) {
    return undefined;
  }

  const store = experimental_context.screenshotStore;
  return isScreenshotStore(store) ? store : undefined;
}

/**
 * One capture attempt made by a subagent, kept on the task output so UIs can
 * render a gallery. Images are referenced by `imageId`, never inlined.
 */
export const taskScreenshotSchema = z.object({
  toolCallId: z.string(),
  url: z.string(),
  viewport: z.string(),
  colorScheme: z.enum(["light", "dark"]),
  fullPage: z.boolean(),
  capturedAt: z.number().int().nonnegative(),
  status: z.number().nullable().optional(),
  title: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  consoleErrors: z.array(z.string()).optional(),
  imageId: z.string().optional(),
  storageError: z.string().optional(),
  error: z.string().optional(),
});

export type TaskScreenshot = z.infer<typeof taskScreenshotSchema>;
