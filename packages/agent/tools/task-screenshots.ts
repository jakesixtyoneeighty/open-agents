import { screenshotInputSchema, screenshotOutputSchema } from "./screenshot";
import type { TaskScreenshot } from "./screenshot-store";

type SubagentStreamPart =
  | {
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      input: unknown;
      output: unknown;
      preliminary?: boolean;
    }
  | {
      type: "tool-error";
      toolCallId: string;
      toolName: string;
      input: unknown;
      error: unknown;
    };

/**
 * Convert a subagent's screenshot tool result (or error) into a gallery entry.
 * Returns undefined for other tools, preliminary results, and unparseable
 * input. The base64 image is dropped; only the stored image id is kept.
 */
export function toTaskScreenshot(
  part: SubagentStreamPart,
  capturedAt: number,
): TaskScreenshot | undefined {
  if (part.toolName !== "screenshot") {
    return undefined;
  }
  if (part.type === "tool-result" && part.preliminary) {
    return undefined;
  }

  const input = screenshotInputSchema.safeParse(part.input);
  if (!input.success) {
    return undefined;
  }

  const base = {
    toolCallId: part.toolCallId,
    url: input.data.url,
    viewport: input.data.viewport ?? "desktop",
    colorScheme: input.data.colorScheme ?? "light",
    fullPage: input.data.fullPage ?? false,
    capturedAt,
  } satisfies TaskScreenshot;

  if (part.type === "tool-error") {
    const message =
      part.error instanceof Error ? part.error.message : String(part.error);
    return { ...base, error: `Screenshot failed: ${message}` };
  }

  const output = screenshotOutputSchema.safeParse(part.output);
  if (!output.success) {
    return { ...base, error: "Screenshot failed: unreadable result" };
  }
  if (!output.data.success) {
    return { ...base, error: output.data.error };
  }

  const result = output.data;
  return {
    ...base,
    status: result.status,
    title: result.title,
    width: result.width,
    height: result.height,
    consoleErrors: result.consoleErrors,
    ...(result.imageId ? { imageId: result.imageId } : {}),
    ...(result.storageError ? { storageError: result.storageError } : {}),
  };
}
