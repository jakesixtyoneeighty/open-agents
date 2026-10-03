import { tool } from "ai";
import { z } from "zod";
import { getScreenshotStore } from "./screenshot-store";
import { getSandbox, shellEscape } from "./utils";

import { SETUP_SCRIPT, SETUP_TIMEOUT_MS, VIEWPORTS } from "./browser-setup";

const CAPTURE_TIMEOUT_MS = 90_000;
const MAX_FULL_PAGE_HEIGHT = 3_000;

const CAPTURE_SCRIPT = `import { chromium } from "playwright";

const [url, outPath, width, height, fullPage, waitMs, colorScheme, maxHeight] =
  process.argv.slice(2);
const consoleErrors = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: Number(width), height: Number(height) },
    colorScheme,
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const response = await page.goto(url, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(Number(waitMs));

  const pageHeight = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  const captureFull = fullPage === "true";
  const captureHeight = captureFull
    ? Math.min(pageHeight, Number(maxHeight))
    : Number(height);
  const needsClip = captureFull && pageHeight > Number(maxHeight);

  await page.screenshot({
    path: outPath,
    type: "jpeg",
    quality: 70,
    fullPage: captureFull,
    ...(needsClip
      ? { clip: { x: 0, y: 0, width: Number(width), height: captureHeight } }
      : {}),
  });

  console.log(
    JSON.stringify({
      status: response ? response.status() : null,
      title: await page.title(),
      pageHeight,
      captureHeight,
      consoleErrors: consoleErrors.slice(0, 10),
    }),
  );
} finally {
  await browser.close();
}`;

const captureResultSchema = z.object({
  status: z.number().nullable(),
  title: z.string(),
  pageHeight: z.number(),
  captureHeight: z.number(),
  consoleErrors: z.array(z.string()),
});

const screenshotInputSchema = z.object({
  url: z
    .string()
    .url({ protocol: /^https?$/ })
    .describe(
      "URL to capture, usually the local dev server (e.g. http://localhost:3000/pricing)",
    ),
  viewport: z
    .enum(["desktop", "tablet", "mobile"])
    .optional()
    .describe(
      "Viewport preset: desktop 1440x900, tablet 834x1112, mobile 390x844. Default: desktop",
    ),
  fullPage: z
    .boolean()
    .optional()
    .describe(
      `Capture the full scrollable page (capped at ${MAX_FULL_PAGE_HEIGHT}px tall) instead of just the viewport. Default: false`,
    ),
  colorScheme: z
    .enum(["light", "dark"])
    .optional()
    .describe("Emulated prefers-color-scheme. Default: light"),
  waitMs: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .optional()
    .describe(
      "Extra time to wait after load before capturing, for fonts and entrance animations. Default: 1000",
    ),
});

const screenshotOutputSchema = z.union([
  z.object({
    success: z.literal(true),
    url: z.string(),
    viewport: z.string(),
    width: z.number(),
    height: z.number(),
    status: z.number().nullable(),
    title: z.string(),
    pageHeight: z.number(),
    consoleErrors: z.array(z.string()),
    imagePath: z.string(),
    imageId: z.string().optional(),
    capturedAt: z.number().optional(),
    storageError: z.string().optional(),
    image: z.string(),
    mediaType: z.literal("image/jpeg"),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);

export type ScreenshotToolOutput = z.infer<typeof screenshotOutputSchema>;
export { screenshotInputSchema, screenshotOutputSchema };

/**
 * Hand the capture to the host's durable store, if any. A storage failure is
 * reported alongside the capture rather than failing it: the subagent can
 * still see the image.
 */
async function storeImage(
  experimental_context: unknown,
  toolCallId: string,
  image: Buffer,
): Promise<{ imageId?: string; storageError?: string }> {
  const store = getScreenshotStore(experimental_context);
  if (!store) {
    return {};
  }

  try {
    const { imageId } = await store.save({
      toolCallId,
      image,
      mediaType: "image/jpeg",
    });
    return { imageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { storageError: `Could not store screenshot: ${message}` };
  }
}

export const screenshotTool = tool({
  needsApproval: false,
  description: `Take a screenshot of a web page with a headless browser running in the sandbox, and see the result.

USAGE:
- Start the dev server first with bash (detached: true), then capture it at http://localhost:<port>
- The first call installs a headless browser, which can take a minute or two; later calls are fast
- Check both desktop and mobile viewports for any layout you build
- Returns the image plus the HTTP status, page title, and any console errors

EXAMPLES:
- url: "http://localhost:3000"
- url: "http://localhost:3000/pricing", viewport: "mobile", fullPage: true`,
  inputSchema: screenshotInputSchema,
  outputSchema: screenshotOutputSchema,
  execute: async (
    {
      url,
      viewport = "desktop",
      fullPage = false,
      colorScheme = "light",
      waitMs = 1_000,
    },
    { experimental_context, abortSignal, toolCallId },
  ) => {
    const sandbox = await getSandbox(experimental_context, "screenshot");
    const workingDirectory = sandbox.workingDirectory;
    const { width, height } = VIEWPORTS[viewport];

    try {
      const setup = await sandbox.exec(
        `mkdir -p "$HOME/.open-agents/browser" && flock -w 300 "$HOME/.open-agents/browser/setup.lock" sh -c ${shellEscape(SETUP_SCRIPT)}`,
        workingDirectory,
        SETUP_TIMEOUT_MS,
        { signal: abortSignal },
      );
      if (!setup.success) {
        return {
          success: false,
          error: `Failed to install headless browser: ${(setup.stderr || setup.stdout).slice(-1_000)}`,
        };
      }

      const homeResult = await sandbox.exec(
        'printf %s "$HOME"',
        workingDirectory,
        10_000,
        { signal: abortSignal },
      );
      const browserDir = `${homeResult.stdout.trim()}/.open-agents/browser`;
      const scriptPath = `${browserDir}/capture.mjs`;
      const imagePath = `${browserDir}/shots/${toolCallId}.jpg`;

      await sandbox.mkdir(`${browserDir}/shots`, { recursive: true });
      await sandbox.writeFile(scriptPath, CAPTURE_SCRIPT, "utf-8");

      const args = [
        url,
        imagePath,
        String(width),
        String(height),
        String(fullPage),
        String(waitMs),
        colorScheme,
        String(MAX_FULL_PAGE_HEIGHT),
      ].map(shellEscape);

      const capture = await sandbox.exec(
        `cd ${shellEscape(browserDir)} && node capture.mjs ${args.join(" ")}`,
        workingDirectory,
        CAPTURE_TIMEOUT_MS,
        { signal: abortSignal },
      );
      if (!capture.success) {
        return {
          success: false,
          error: `Screenshot failed: ${(capture.stderr || capture.stdout).slice(-1_500)}`,
        };
      }

      const lastLine = capture.stdout.trim().split("\n").at(-1) ?? "";
      const parsed = captureResultSchema.safeParse(JSON.parse(lastLine));
      if (!parsed.success) {
        return {
          success: false,
          error: "Screenshot failed: could not read capture result",
        };
      }

      const image = await sandbox.readFileBuffer(imagePath);
      const stored = await storeImage(experimental_context, toolCallId, image);

      return {
        success: true,
        capturedAt: Date.now(),
        url,
        viewport,
        width,
        height: parsed.data.captureHeight,
        status: parsed.data.status,
        title: parsed.data.title,
        pageHeight: parsed.data.pageHeight,
        consoleErrors: parsed.data.consoleErrors,
        imagePath,
        ...stored,
        image: image.toString("base64"),
        mediaType: "image/jpeg" as const,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Screenshot failed: ${message}` };
    }
  },
  toModelOutput: ({ output }) => {
    if (!output.success) {
      return { type: "error-text", value: output.error };
    }

    const { image, mediaType, ...details } = output;
    return {
      type: "content",
      value: [
        { type: "text", text: JSON.stringify(details) },
        { type: "image-data", data: image, mediaType },
      ],
    };
  },
});
