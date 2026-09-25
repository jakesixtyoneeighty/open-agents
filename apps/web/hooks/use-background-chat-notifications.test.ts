import { describe, expect, test } from "bun:test";
import {
  collectNewOutcomes,
  resolveChatOutcome,
  type ChatOutcome,
} from "@/lib/chat/outcome";

const base = {
  aborted: false,
  failed: false,
  exhausted: false,
  needsInput: false,
  finishReason: "stop",
};
describe("authoritative outcomes", () => {
  test("distinguishes success, cancellation, failure and input", () => {
    expect(resolveChatOutcome(base)).toBe("completed");
    expect(resolveChatOutcome({ ...base, aborted: true })).toBe("stopped");
    expect(resolveChatOutcome({ ...base, failed: true })).toBe("failed");
    expect(
      resolveChatOutcome({
        ...base,
        needsInput: true,
        finishReason: "tool-calls",
      }),
    ).toBe("needs-input");
  });
  test("does not call limits and abnormal endings completed", () => {
    for (const finishReason of [
      undefined,
      "length",
      "content-filter",
      "other",
      "error",
      "tool-calls",
    ]) {
      expect(resolveChatOutcome({ ...base, finishReason })).toBe("failed");
    }
    expect(resolveChatOutcome({ ...base, exhausted: true })).toBe("failed");
    expect(
      resolveChatOutcome({ ...base, failed: true, needsInput: true }),
    ).toBe("failed");
  });
  test("detects short runs between polls, dedupes, and ignores disappearing streams", () => {
    const outcome: ChatOutcome = {
      runId: "run-1",
      chatId: "chat-1",
      status: "stopped",
      finishedAt: new Date().toISOString(),
    };
    expect(collectNewOutcomes(new Set(), [outcome])).toEqual([outcome]);
    expect(collectNewOutcomes(new Set(["run-1"]), [outcome])).toEqual([]);
    expect(collectNewOutcomes(new Set(["run-1"]), [])).toEqual([]);
    expect(
      collectNewOutcomes(new Set(["run-1"]), [{ ...outcome, runId: "run-2" }]),
    ).toHaveLength(1);
  });
});
