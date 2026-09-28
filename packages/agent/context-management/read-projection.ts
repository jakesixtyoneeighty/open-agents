import type { ModelMessage } from "ai";
import { z } from "zod";

const readIdentitySchema = z.object({
  path: z.string().min(1),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
});
const successfulReadSchema = z.object({
  success: z.literal(true),
  content: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  clipped: z.literal(false),
  columnOffset: z.literal(0),
  readIdentity: readIdentitySchema,
});

/**
 * Keep the earliest complete copy, so growing a conversation never rewrites its
 * cached prefix. Only project requests; persisted/UI messages keep every result.
 */
export function projectReadMessages(messages: ModelMessage[]): ModelMessage[] {
  const seen = new Map<string, { toolCallId: string; content: string }>();
  const resultCounts = new Map<string, number>();
  for (const message of messages) {
    if (message.role !== "tool") continue;
    for (const part of message.content) {
      if (part.type !== "tool-result") continue;
      resultCounts.set(
        part.toolCallId,
        (resultCounts.get(part.toolCallId) ?? 0) + 1,
      );
    }
  }

  return messages.map((message) => {
    if (message.role !== "tool") return message;
    const additions: Array<[string, { toolCallId: string; content: string }]> =
      [];
    const content = message.content.map((part) => {
      if (
        part.type !== "tool-result" ||
        part.toolName !== "read" ||
        part.output.type !== "json"
      ) {
        return part;
      }
      const value = part.output.value;
      if (!value || typeof value !== "object" || Array.isArray(value))
        return part;
      const { readIdentity: _identity, ...visibleValue } = value;
      const parsed = successfulReadSchema.safeParse(value);
      let projectedValue = visibleValue;
      if (parsed.success && resultCounts.get(part.toolCallId) === 1) {
        const read = parsed.data;
        if (read.endLine >= read.startLine) {
          const key = JSON.stringify([
            read.readIdentity.path,
            read.readIdentity.revision,
            read.startLine,
            read.endLine,
          ]);
          const previous = seen.get(key);
          const reference = previous
            ? `[Identical file revision and lines; see read result ${previous.toolCallId}.]`
            : undefined;
          if (
            previous &&
            previous.content === read.content &&
            reference &&
            reference.length < read.content.length
          ) {
            projectedValue = { ...visibleValue, content: reference };
          } else if (!previous) {
            additions.push([
              key,
              { toolCallId: part.toolCallId, content: read.content },
            ]);
          }
        }
      }
      return { ...part, output: { ...part.output, value: projectedValue } };
    });
    // Parallel reads in one result batch must not refer to one another.
    for (const [key, value] of additions) {
      if (!seen.has(key)) seen.set(key, value);
    }
    return { ...message, content };
  });
}
