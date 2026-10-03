import {
  generateImage,
  tool,
  type ModelMessage,
  type ProviderMetadata,
} from "ai";
import * as path from "path";
import { z } from "zod";
import { gatewayImageModel } from "../models";
import { resolveSandboxRealPath, resolveWorkspacePath } from "./path-security";
import { getSandbox, shellEscape, toDisplayPath } from "./utils";

/** Model per asset style: photographic/painterly raster vs. SVG vector art. */
export const IMAGE_GENERATION_MODELS = {
  raster: "openai/gpt-image-2.5-sunburst",
  vector: "recraft/recraft-v4.1",
} as const;

type ImageStyle = keyof typeof IMAGE_GENERATION_MODELS;

const PROVIDER_OPTIONS: Record<ImageStyle, ProviderMetadata | undefined> = {
  raster: undefined,
  vector: { recraft: { style: "vector_illustration" } },
};

const SVG_MEDIA_TYPE = "image/svg+xml";

/** Image generation is billed per image, so each subagent run gets a budget. */
export const MAX_IMAGES_PER_RUN = 8;

const GENERATE_IMAGE_TOOL_NAME = "generate_image";
const GENERATION_TIMEOUT_MS = 3 * 60_000;
const DECODE_TIMEOUT_MS = 30_000;

const SIZES = {
  square: "1024x1024",
  landscape: "1536x1024",
  portrait: "1024x1536",
} as const;

const EXTENSIONS_BY_MEDIA_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  [SVG_MEDIA_TYPE]: ".svg",
};

const generateImageInputSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .describe(
      "Detailed art-directed prompt: subject, composition, lighting, palette, material, and style",
    ),
  outputPath: z
    .string()
    .describe(
      "Workspace-relative path to save the image (e.g. public/images/hero.png). The extension is corrected to match the returned format.",
    ),
  style: z
    .enum(["raster", "vector"])
    .optional()
    .describe(
      "raster: photography, painterly or textured imagery (PNG). vector: flat illustrations, spot art, icon sets, patterns (SVG). Default: raster",
    ),
  aspect: z
    .enum(["square", "landscape", "portrait"])
    .optional()
    .describe(
      "square 1024x1024, landscape 1536x1024, portrait 1024x1536. Default: landscape",
    ),
});

/**
 * Count generate_image calls already made in this run. Calls issued in
 * parallel within the current step are not yet in `messages`, so the cap can
 * be exceeded by at most one step's worth of parallel calls.
 */
export function countPriorImageCalls(messages: ModelMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (message.role !== "assistant" || typeof message.content === "string") {
      continue;
    }
    for (const part of message.content) {
      if (
        part.type === "tool-call" &&
        part.toolName === GENERATE_IMAGE_TOOL_NAME
      ) {
        count++;
      }
    }
  }
  return count;
}

/** Swap the requested extension for the one matching the generated format. */
export function withImageExtension(filePath: string, mediaType: string) {
  const extension = EXTENSIONS_BY_MEDIA_TYPE[mediaType];
  if (!extension) {
    return filePath;
  }
  const current = path.extname(filePath);
  if (current.toLowerCase() === extension) {
    return filePath;
  }
  return `${filePath.slice(0, filePath.length - current.length)}${extension}`;
}

export const generateImageTool = tool({
  needsApproval: false,
  description: `Generate an image asset and save it into the workspace.

STYLES:
- raster (${IMAGE_GENERATION_MODELS.raster}): hero imagery, editorial photography, textures, painterly backgrounds
- vector (${IMAGE_GENERATION_MODELS.vector}): flat illustrations, spot art, icon sets, decorative patterns, saved as editable SVG

WHEN TO USE:
- Imagery and illustration the chosen direction calls for
- Replacing placeholder or stock imagery with art-directed assets

WHEN NOT TO USE:
- Logos, wordmarks, UI chrome, or anything with legible text: build those as SVG or code
- Simple geometric icons a few SVG paths can express
- When the chosen direction calls for intentional absence of imagery
- Decorative filler that does not serve the visual thesis

USAGE:
- Write prompts from the visual thesis, palette, and image logic you locked, not generic stock descriptions
- Budget: ${MAX_IMAGES_PER_RUN} images per run. Plan the asset list before generating
- Save under the project's static asset directory (e.g. public/) and reference the returned path
- Verify placement with the screenshot tool; regenerate only when the result is clearly wrong
- On failure, fall back to CSS/SVG treatment and note it in your summary

EXAMPLES:
- prompt: "Overhead photograph of linen specimen trays under cool museum light, muted gray-green palette, shallow depth of field", outputPath: "public/images/hero.png", aspect: "landscape"
- prompt: "Flat two-color line illustration of a transit route map fragment, ink black on bone white, no text", outputPath: "public/illustrations/route.svg", style: "vector", aspect: "square"`,
  inputSchema: generateImageInputSchema,
  execute: async (
    { prompt, outputPath, aspect = "landscape", style = "raster" },
    { experimental_context, abortSignal, messages },
  ) => {
    const priorCalls = countPriorImageCalls(messages);
    if (priorCalls >= MAX_IMAGES_PER_RUN) {
      return {
        success: false,
        error: `Image budget reached (${MAX_IMAGES_PER_RUN} per run). Reuse existing assets or use CSS/SVG treatment.`,
      };
    }

    const sandbox = await getSandbox(experimental_context, "generate_image");
    const workingDirectory = sandbox.workingDirectory;

    try {
      const { image } = await generateImage({
        model: gatewayImageModel(IMAGE_GENERATION_MODELS[style]),
        prompt,
        size: SIZES[aspect],
        providerOptions: PROVIDER_OPTIONS[style],
        abortSignal: abortSignal
          ? AbortSignal.any([
              abortSignal,
              AbortSignal.timeout(GENERATION_TIMEOUT_MS),
            ])
          : AbortSignal.timeout(GENERATION_TIMEOUT_MS),
      });

      if (style === "vector" && image.mediaType !== SVG_MEDIA_TYPE) {
        return {
          success: false,
          error: `Vector generation returned ${image.mediaType} instead of SVG. Build this asset as hand-written SVG instead.`,
        };
      }

      const absolutePath = resolveWorkspacePath(
        withImageExtension(outputPath, image.mediaType),
        workingDirectory,
      );
      if (!absolutePath) {
        return {
          success: false,
          error: "Path must stay within the workspace.",
        };
      }

      const realPath = await resolveSandboxRealPath({
        sandbox,
        absolutePath,
        workingDirectory,
      });
      if (realPath && !resolveWorkspacePath(realPath, workingDirectory)) {
        return {
          success: false,
          error: "Path resolves outside the workspace.",
        };
      }

      // The sandbox file API is text-only, so stage base64 and decode in place.
      await sandbox.mkdir(path.dirname(absolutePath), { recursive: true });
      const stagingPath = `${absolutePath}.b64`;
      await sandbox.writeFile(stagingPath, image.base64, "utf-8");
      const decode = await sandbox.exec(
        `base64 -d < ${shellEscape(stagingPath)} > ${shellEscape(absolutePath)}; status=$?; rm -f ${shellEscape(stagingPath)}; exit $status`,
        workingDirectory,
        DECODE_TIMEOUT_MS,
        { signal: abortSignal },
      );
      if (!decode.success) {
        return {
          success: false,
          error: `Failed to save image: ${(decode.stderr || decode.stdout).slice(-500)}`,
        };
      }

      const stats = await sandbox.stat(absolutePath);

      return {
        success: true,
        path: toDisplayPath(absolutePath, workingDirectory),
        style,
        model: IMAGE_GENERATION_MODELS[style],
        mediaType: image.mediaType,
        size: SIZES[aspect],
        bytesWritten: stats.size,
        imagesRemaining: MAX_IMAGES_PER_RUN - priorCalls - 1,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Image generation failed: ${message}`,
      };
    }
  },
});
