import { expect, test } from "bun:test";
import { commandOutputWindow, previewCommandOutput } from "./command-output";

test("preview preserves the tail failure and complete logs can be paged", () => {
  const log =
    "START\n" + "progress\n".repeat(10_000) + "FAIL: final diagnostic";
  const preview = previewCommandOutput(log, 8000);
  expect(preview.truncated).toBe(true);
  expect(preview.output.length).toBe(8000);
  expect(preview.output.startsWith("START")).toBe(true);
  expect(preview.output.endsWith("FAIL: final diagnostic")).toBe(true);
  let offset = 0;
  let recovered = "";
  for (;;) {
    const page = commandOutputWindow(log, offset, 8000);
    recovered += page.content;
    if (page.nextOffset === undefined) break;
    offset = page.nextOffset;
  }
  expect(recovered).toBe(log);
  expect(
    commandOutputWindow(log, log.length + 10, 8000).nextOffset,
  ).toBeUndefined();
});

test("Unicode output remains intact across pages", () => {
  const log = "a😀b😀c";
  let offset = 0;
  let recovered = "";
  for (;;) {
    const page = commandOutputWindow(log, offset, 2);
    expect(page.content.isWellFormed()).toBe(true);
    recovered += page.content;
    if (page.nextOffset === undefined) break;
    expect(page.nextOffset).toBeGreaterThan(offset);
    offset = page.nextOffset;
  }
  expect(recovered).toBe(log);
});
