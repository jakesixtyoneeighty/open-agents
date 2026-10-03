import { expect, test } from "bun:test";
import { summarizeGlobOutput, summarizeGrepOutput } from "./search-output";

test("grep summaries show totals, paging and skipped files", () => {
  expect(
    summarizeGrepOutput({
      success: true,
      matchCount: 150,
      filesWithMatches: 3,
      matches: [{ file: "src/a.ts", line: 4, content: "  call()" }],
      complete: false,
      nextCursor: "s1.next",
      skipped: { binary: { count: 2, paths: ["a.bin", "b.bin"] } },
    }),
  ).toEqual({
    lines: ["src/a.ts:4  call()"],
    meta: "150 matches+ in 3 files+",
    notes: [
      "Scan paused before every file was searched; totals are lower bounds.",
      "Showing 1 of 150 matches on this page; more pages are available.",
      "Skipped files: 2 binary.",
    ],
  });
  expect(
    summarizeGrepOutput({
      success: true,
      files: ["a.ts"],
      filesWithMatches: 1,
    }),
  ).toMatchObject({ lines: ["a.ts"], meta: "1 file" });
  expect(
    summarizeGrepOutput({
      success: true,
      matchCount: 7,
      counts: [{ file: "a.ts", count: 7 }],
    }),
  ).toMatchObject({ lines: ["    7  a.ts"], meta: "7 matches" });
  // Legacy unpaged output keeps rendering.
  expect(
    summarizeGrepOutput({
      success: true,
      matches: [
        { file: "a.ts", line: 1, content: "x" },
        { file: "a.ts", line: 2, content: "y" },
      ],
    }),
  ).toMatchObject({ meta: "2 matches in 1 file", notes: [] });
  expect(summarizeGrepOutput({ success: false, error: "bad" })).toBeNull();
});

test("glob summaries use totals across pages", () => {
  expect(
    summarizeGlobOutput({
      success: true,
      totalFiles: 240,
      files: [{ path: "a.ts", size: 1, modifiedAt: "" }],
      nextCursor: "s1.next",
    }),
  ).toMatchObject({ lines: ["a.ts"], meta: "240 files" });
  expect(summarizeGlobOutput({ success: true, files: [] })).toMatchObject({
    meta: "No files",
  });
});
