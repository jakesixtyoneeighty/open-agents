import { describe, expect, test } from "bun:test";
import {
  collectScreenshotImageIds,
  isScreenshotImageId,
  toScreenshotImageId,
} from "./image-id";

describe("toScreenshotImageId", () => {
  test("keeps safe tool call ids and replaces unsafe characters", () => {
    expect(toScreenshotImageId("toolu_01AbC-9")).toBe("toolu_01AbC-9");
    expect(toScreenshotImageId("call/../x.y")).toBe("call____x_y");
    expect(toScreenshotImageId("")).toBe("screenshot");
  });

  test("always produces a valid id", () => {
    for (const input of ["a".repeat(300), "../../etc/passwd", "ok"]) {
      expect(isScreenshotImageId(toScreenshotImageId(input))).toBe(true);
    }
  });
});

describe("isScreenshotImageId", () => {
  test("rejects path traversal and separators", () => {
    expect(isScreenshotImageId("../x")).toBe(false);
    expect(isScreenshotImageId("a/b")).toBe(false);
    expect(isScreenshotImageId("")).toBe(false);
  });
});

describe("collectScreenshotImageIds", () => {
  test("finds image ids in nested task tool outputs", () => {
    const parts = [
      {
        id: "m1",
        parts: [
          { type: "text", text: "hi" },
          {
            type: "tool-task",
            output: {
              screenshots: [
                { imageId: "a" },
                { imageId: "b" },
                { error: "failed" },
                { imageId: "../evil" },
              ],
            },
          },
        ],
      },
      { parts: [{ output: { screenshots: [{ imageId: "a" }] } }] },
    ];

    expect([...collectScreenshotImageIds(parts)].sort()).toEqual(["a", "b"]);
  });

  test("returns an empty set for unrelated data", () => {
    expect(collectScreenshotImageIds(null).size).toBe(0);
    expect(collectScreenshotImageIds({ screenshots: "nope" }).size).toBe(0);
  });
});
