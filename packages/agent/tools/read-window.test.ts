import { expect, test } from "bun:test";
import { readWindow, READ_CHARACTER_LIMIT } from "./read-window";

test("recovers a huge line and following lines without losing characters", () => {
  const source = "x".repeat(60_000) + "\nlast line";
  let next: { offset: number; columnOffset: number } | undefined = {
    offset: 1,
    columnOffset: 0,
  };
  let firstLine = "";
  let lastLine = "";
  let pages = 0;
  while (next) {
    const page = readWindow(source, next.offset, 200, next.columnOffset);
    expect(page.content.length).toBeLessThanOrEqual(READ_CHARACTER_LIMIT);
    for (const line of page.content.split("\n")) {
      if (line.startsWith("1: ")) firstLine += line.slice(3);
      if (line.startsWith("2: ")) lastLine += line.slice(3);
    }
    next = page.nextRead;
    expect(++pages).toBeLessThan(10);
  }
  expect(firstLine + "\n" + lastLine).toBe(source);
});

test("line limits return an exact continuation and EOF terminates", () => {
  const first = readWindow("a\nb\nc", 1, 2);
  expect(first).toMatchObject({
    content: "1: a\n2: b",
    endLine: 2,
    clipped: false,
    nextRead: { offset: 3, columnOffset: 0 },
  });
  expect(readWindow("a\nb\nc", 3, 2).nextRead).toBeUndefined();
  expect(readWindow("a", 10, 2).nextRead).toBeUndefined();
});

test("continuations keep Unicode pairs intact at the output boundary", () => {
  const source = "x".repeat(READ_CHARACTER_LIMIT - 4) + "😀tail";
  const first = readWindow(source, 1, 200);
  expect(first.content.isWellFormed()).toBe(true);
  const second = readWindow(
    source,
    first.nextRead!.offset,
    200,
    first.nextRead!.columnOffset,
  );
  expect(second.content.isWellFormed()).toBe(true);
  expect(first.content.slice(3) + second.content.slice(3)).toBe(source);
});
