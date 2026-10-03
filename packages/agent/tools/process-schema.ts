import { z } from "zod";
import { previewUrlSchema } from "./browser-schema";

const processId = z.string().regex(/^[a-f0-9]{64}$/);
export const processInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    command: z.string().min(1).max(16_000),
    cwd: z.string().max(1000).optional(),
    timeoutSeconds: z.number().int().min(1).max(21_600).default(3600),
    readiness: z
      .discriminatedUnion("kind", [
        z.object({
          kind: z.literal("http"),
          url: previewUrlSchema,
          status: z.number().int().min(200).max(299).default(200),
        }),
        z.object({ kind: z.literal("log"), text: z.string().min(1).max(500) }),
      ])
      .optional(),
  }),
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("status"), processId }),
  z.object({ action: z.literal("stop"), processId }),
  z.object({
    action: z.literal("wait"),
    processId,
    until: z.enum(["exit", "ready"]).default("exit"),
    timeoutSeconds: z.number().int().min(1).max(30).default(10),
  }),
  z.object({
    action: z.literal("logs"),
    processId,
    stream: z.enum(["stdout", "stderr"]).default("stdout"),
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(2).max(16_000).default(8000),
  }),
]);

export const processRecordSchema = z.object({
  processId,
  commandId: z.string(),
  command: z.string(),
  cwd: z.string(),
  state: z.enum([
    "starting",
    "running",
    "exited",
    "stopped",
    "timed_out",
    "expired",
    "error",
  ]),
  readiness: z.enum(["not_configured", "pending", "ready", "unavailable"]),
  readinessDetail: z.string().optional(),
  readinessCheckedAt: z.number().optional(),
  startedAt: z.number(),
  deadlineAt: z.number(),
  endedAt: z.number().optional(),
  exitCode: z.number().nullable(),
  signal: z.string().nullable().optional(),
  error: z.string().optional(),
  logsTruncated: z.boolean(),
});
export const processOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  process: processRecordSchema.optional(),
  processes: z.array(processRecordSchema).optional(),
  waitTimedOut: z.boolean().optional(),
  observedAt: z.number().optional(),
  log: z
    .object({
      stream: z.enum(["stdout", "stderr"]),
      content: z.string(),
      offset: z.number(),
      totalCharacters: z.number(),
      nextOffset: z.number().optional(),
      truncated: z.boolean(),
    })
    .optional(),
});
export type ProcessInput = z.infer<typeof processInputSchema>;
export type ProcessOutput = z.infer<typeof processOutputSchema>;
