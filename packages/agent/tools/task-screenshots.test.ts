import { describe, expect, test } from "bun:test";
import { toTaskScreenshot } from "./task-screenshots";

const input = {
  url: "http://localhost:3000/pricing",
  viewport: "mobile",
  fullPage: true,
};

const successOutput = {
  success: true,
  url: input.url,
  viewport: "mobile",
  width: 390,
  height: 2400,
  status: 200,
  title: "Pricing",
  pageHeight: 2400,
  consoleErrors: ["boom"],
  imagePath: "/home/shots/call-1.jpg",
  imageId: "call-1",
  image: "BASE64",
  mediaType: "image/jpeg",
};

describe("toTaskScreenshot", () => {
  test("keeps capture details and the stored id, never the image data", () => {
    const result = toTaskScreenshot(
      {
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "screenshot",
        input,
        output: successOutput,
      },
      42,
    );

    expect(result).toEqual({
      toolCallId: "call-1",
      url: input.url,
      viewport: "mobile",
      colorScheme: "light",
      fullPage: true,
      capturedAt: 42,
      status: 200,
      title: "Pricing",
      width: 390,
      height: 2400,
      consoleErrors: ["boom"],
      imageId: "call-1",
    });
    expect(JSON.stringify(result)).not.toContain("BASE64");
  });

  test("records failed captures and tool errors", () => {
    expect(
      toTaskScreenshot(
        {
          type: "tool-result",
          toolCallId: "call-2",
          toolName: "screenshot",
          input,
          output: { success: false, error: "Screenshot failed: timeout" },
        },
        1,
      )?.error,
    ).toBe("Screenshot failed: timeout");

    expect(
      toTaskScreenshot(
        {
          type: "tool-error",
          toolCallId: "call-3",
          toolName: "screenshot",
          input,
          error: new Error("sandbox gone"),
        },
        1,
      )?.error,
    ).toBe("Screenshot failed: sandbox gone");
  });

  test("keeps a storage failure next to an otherwise good capture", () => {
    const { imageId: _imageId, ...unstored } = successOutput;
    const result = toTaskScreenshot(
      {
        type: "tool-result",
        toolCallId: "call-4",
        toolName: "screenshot",
        input,
        output: { ...unstored, storageError: "Could not store screenshot" },
      },
      1,
    );

    expect(result?.imageId).toBeUndefined();
    expect(result?.storageError).toBe("Could not store screenshot");
    expect(result?.error).toBeUndefined();
  });

  test("ignores other tools and preliminary results", () => {
    expect(
      toTaskScreenshot(
        {
          type: "tool-result",
          toolCallId: "x",
          toolName: "bash",
          input: {},
          output: {},
        },
        1,
      ),
    ).toBeUndefined();
    expect(
      toTaskScreenshot(
        {
          type: "tool-result",
          toolCallId: "x",
          toolName: "screenshot",
          input,
          output: successOutput,
          preliminary: true,
        },
        1,
      ),
    ).toBeUndefined();
  });
});
