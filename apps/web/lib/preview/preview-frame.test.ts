import { describe, expect, test } from "bun:test";
import {
  computePreviewScale,
  getPreviewViewport,
  resolvePreviewFrameUrl,
} from "./preview-frame";

const APP = "https://open-agents.dev";

describe("resolvePreviewFrameUrl", () => {
  test("accepts the sandbox's own https origin", () => {
    expect(resolvePreviewFrameUrl("https://sb-3000.vercel.run", APP)).toEqual({
      ok: true,
      url: "https://sb-3000.vercel.run/",
      origin: "https://sb-3000.vercel.run",
    });
  });

  test("refuses anything that would weaken isolation", () => {
    expect(resolvePreviewFrameUrl("http://sb-3000.vercel.run", APP)).toEqual({
      ok: false,
      reason: "insecure",
    });
    expect(
      resolvePreviewFrameUrl("https://open-agents.dev/api/proxy", APP),
    ).toEqual({ ok: false, reason: "same-origin" });
    expect(
      resolvePreviewFrameUrl(["javascript", "alert(1)"].join(":"), APP),
    ).toEqual({
      ok: false,
      reason: "insecure",
    });
    expect(resolvePreviewFrameUrl("/relative", APP)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      resolvePreviewFrameUrl("https://user:pass@sb-3000.vercel.run", APP),
    ).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("computePreviewScale", () => {
  test("fits wide viewports into the pane without scaling up", () => {
    expect(computePreviewScale(640, 1280)).toBe(0.5);
    expect(computePreviewScale(800, 390)).toBe(1);
    expect(computePreviewScale(800, null)).toBe(1);
    expect(computePreviewScale(0, 1280)).toBe(1);
  });
});

describe("getPreviewViewport", () => {
  test("returns preset widths", () => {
    expect(getPreviewViewport("mobile").width).toBe(390);
    expect(getPreviewViewport("fit").width).toBeNull();
  });
});
