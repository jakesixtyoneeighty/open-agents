import { z } from "zod";

export const browserViewportSchema = z.enum(["desktop", "tablet", "mobile"]);
export const browserIdSchema = z.string().uuid();
export const previewUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password
    );
  }, "Use an http(s) loopback preview URL without credentials.");

export const browserSessionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("open"),
    url: previewUrlSchema,
    viewport: browserViewportSchema.default("desktop"),
  }),
  z.object({ action: z.literal("close"), sessionId: browserIdSchema }),
]);
export const browserInspectSchema = z.union([
  z.object({ sessionId: browserIdSchema }),
  z.object({
    url: previewUrlSchema,
    viewport: browserViewportSchema.default("desktop"),
  }),
]);
const target = z.object({
  role: z.enum([
    "button",
    "link",
    "textbox",
    "checkbox",
    "radio",
    "combobox",
    "tab",
    "menuitem",
    "heading",
  ]),
  name: z
    .string()
    .max(300)
    .describe(
      "Exact accessible name from browser_inspect; ambiguous targets fail.",
    ),
});
export const browserActionSchema = z.object({
  sessionId: browserIdSchema,
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("click"), target }),
    z.object({ kind: z.literal("fill"), target, value: z.string().max(2000) }),
    z.object({ kind: z.literal("select"), target, value: z.string().max(300) }),
    z.object({ kind: z.literal("check"), target, checked: z.boolean() }),
    z.object({
      kind: z.literal("press"),
      key: z.enum([
        "Tab",
        "Shift+Tab",
        "Enter",
        "Space",
        "Escape",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ]),
    }),
    z.object({ kind: z.literal("navigate"), url: previewUrlSchema }),
    z.object({
      kind: z.literal("expect_text"),
      text: z.string().min(1).max(500),
    }),
  ]),
});

export const browserOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  evidenceId: z.string().optional(),
  capturedAt: z.number().optional(),
  sessionId: browserIdSchema.optional(),
  closed: z.boolean().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  viewport: browserViewportSchema.optional(),
  status: z.number().nullable().optional(),
  snapshot: z.string().optional(),
  focused: z.string().optional(),
  action: z.string().optional(),
  console: z.array(z.object({ type: z.string(), text: z.string() })).optional(),
  network: z
    .array(
      z.object({
        url: z.string(),
        method: z.string(),
        status: z.number().optional(),
        error: z.string().optional(),
      }),
    )
    .optional(),
  truncated: z
    .object({ snapshot: z.boolean(), console: z.number(), network: z.number() })
    .optional(),
});
export type BrowserOutput = z.infer<typeof browserOutputSchema>;
