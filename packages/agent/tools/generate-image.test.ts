import { describe, expect, test } from "bun:test";
import type { ModelMessage } from "ai";
import { countPriorImageCalls, withImageExtension } from "./generate-image";

function toolCall(toolName: string, toolCallId: string): ModelMessage {
  return {
    role: "assistant",
    content: [{ type: "tool-call", toolCallId, toolName, input: {} }],
  };
}

describe("countPriorImageCalls", () => {
  test("counts only generate_image tool calls", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Build the landing page" },
      toolCall("generate_image", "a"),
      toolCall("screenshot", "b"),
      {
        role: "assistant",
        content: [
          { type: "text", text: "Two more assets" },
          {
            type: "tool-call",
            toolCallId: "c",
            toolName: "generate_image",
            input: {},
          },
          {
            type: "tool-call",
            toolCallId: "d",
            toolName: "generate_image",
            input: {},
          },
        ],
      },
      { role: "assistant", content: "done" },
    ];

    expect(countPriorImageCalls(messages)).toBe(3);
  });

  test("returns zero for a fresh run", () => {
    expect(countPriorImageCalls([])).toBe(0);
  });
});

describe("withImageExtension", () => {
  test("keeps a matching extension", () => {
    expect(withImageExtension("public/hero.png", "image/png")).toBe(
      "public/hero.png",
    );
    expect(withImageExtension("public/hero.JPG", "image/jpeg")).toBe(
      "public/hero.JPG",
    );
  });

  test("replaces a mismatched extension", () => {
    expect(withImageExtension("public/hero.webp", "image/png")).toBe(
      "public/hero.png",
    );
  });

  test("appends an extension when missing", () => {
    expect(withImageExtension("public/images/hero", "image/webp")).toBe(
      "public/images/hero.webp",
    );
  });

  test("leaves unknown media types untouched", () => {
    expect(withImageExtension("public/hero.png", "image/avif")).toBe(
      "public/hero.png",
    );
  });
});
