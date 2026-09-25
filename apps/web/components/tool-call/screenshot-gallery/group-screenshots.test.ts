import { describe, expect, test } from "bun:test";
import type { TaskScreenshot } from "@open-agents/agent";
import {
  getScreenshotIssues,
  groupScreenshots,
  pageLabel,
} from "./group-screenshots";

function shot(overrides: Partial<TaskScreenshot> = {}): TaskScreenshot {
  return {
    toolCallId: "call-1",
    url: "http://localhost:3000/",
    viewport: "desktop",
    colorScheme: "light",
    fullPage: false,
    capturedAt: 1,
    status: 200,
    title: "Home",
    consoleErrors: [],
    imageId: "call-1",
    ...overrides,
  };
}

describe("pageLabel", () => {
  test("uses the path, or the host for the root page", () => {
    expect(pageLabel("http://localhost:3000/")).toBe("localhost:3000");
    expect(pageLabel("http://localhost:3000/pricing/")).toBe("/pricing");
    expect(pageLabel("http://localhost:3000/a?tab=b")).toBe("/a?tab=b");
    expect(pageLabel("not a url")).toBe("not a url");
  });
});

describe("groupScreenshots", () => {
  test("groups by page, then orders viewports desktop before mobile", () => {
    const pages = groupScreenshots([
      shot({ toolCallId: "m", viewport: "mobile", capturedAt: 2 }),
      shot({ toolCallId: "d", viewport: "desktop", capturedAt: 3 }),
      shot({
        toolCallId: "p",
        url: "http://localhost:3000/pricing",
        capturedAt: 4,
      }),
    ]);

    expect(pages.map((page) => page.label)).toEqual([
      "localhost:3000",
      "/pricing",
    ]);
    expect(pages[0]?.shots.map((s) => s.viewport)).toEqual([
      "desktop",
      "mobile",
    ]);
  });

  test("treats trailing slashes and hashes as the same page", () => {
    const pages = groupScreenshots([
      shot({ toolCallId: "a", url: "http://localhost:3000/pricing" }),
      shot({
        toolCallId: "b",
        url: "http://localhost:3000/pricing/#faq",
        capturedAt: 2,
      }),
    ]);

    expect(pages).toHaveLength(1);
    expect(pages[0]?.shots[0]?.attempts).toHaveLength(2);
  });

  test("keeps light and dark captures as separate shots", () => {
    const pages = groupScreenshots([
      shot({ toolCallId: "l" }),
      shot({ toolCallId: "k", colorScheme: "dark", capturedAt: 2 }),
    ]);

    expect(pages[0]?.shots.map((s) => s.colorScheme)).toEqual([
      "light",
      "dark",
    ]);
  });

  test("offers before/after only when two stored images exist", () => {
    const [single] = groupScreenshots([shot()]);
    expect(single?.shots[0]?.comparison).toBeNull();

    const [withFailure] = groupScreenshots([
      shot({ toolCallId: "a" }),
      shot({
        toolCallId: "b",
        capturedAt: 2,
        imageId: undefined,
        error: "Screenshot failed: timeout",
      }),
    ]);
    expect(withFailure?.shots[0]?.comparison).toBeNull();
    expect(withFailure?.shots[0]?.latest.toolCallId).toBe("b");

    const [compared] = groupScreenshots([
      shot({ toolCallId: "c", capturedAt: 3, imageId: "c" }),
      shot({ toolCallId: "a", capturedAt: 1, imageId: "a" }),
      shot({ toolCallId: "b", capturedAt: 2, imageId: "b" }),
    ]);
    expect(compared?.shots[0]?.comparison?.before.toolCallId).toBe("a");
    expect(compared?.shots[0]?.comparison?.after.toolCallId).toBe("c");
  });

  test("uses the most recent non-empty title", () => {
    const [page] = groupScreenshots([
      shot({ toolCallId: "a", title: "Old" }),
      shot({ toolCallId: "b", title: "New", capturedAt: 2 }),
      shot({ toolCallId: "c", title: "", capturedAt: 3 }),
    ]);
    expect(page?.title).toBe("New");
  });
});

describe("getScreenshotIssues", () => {
  test("reports a failed capture alone", () => {
    expect(
      getScreenshotIssues(
        shot({ imageId: undefined, error: "Screenshot failed: boom" }),
      ),
    ).toEqual([{ kind: "failed", message: "Screenshot failed: boom" }]);
  });

  test("reports HTTP errors, console errors, and unsaved images", () => {
    expect(
      getScreenshotIssues(
        shot({
          status: 500,
          consoleErrors: ["a", "b"],
          imageId: undefined,
          storageError: "Could not store screenshot: quota",
        }),
      ).map((issue) => issue.message),
    ).toEqual([
      "HTTP 500",
      "2 console errors",
      "Could not store screenshot: quota",
    ]);
  });

  test("reports nothing for a clean capture", () => {
    expect(getScreenshotIssues(shot())).toEqual([]);
  });
});
