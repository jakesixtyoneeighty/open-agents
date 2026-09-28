export const READ_CHARACTER_LIMIT = 16_000;

/** Line-based windows with a column continuation for even a single huge line. */
export function readWindow(
  content: string,
  offset: number,
  limit: number,
  columnOffset = 0,
) {
  const lines = content.split("\n");
  const start = offset - 1;
  const stop = Math.min(lines.length, start + limit);
  const output: string[] = [];
  let remaining = READ_CHARACTER_LIMIT;
  let endLine = start;
  let clipped = false;
  let nextRead: { offset: number; columnOffset: number } | undefined;
  for (let index = start; index < stop; index++) {
    const line = lines[index] ?? "";
    const column = index === start ? columnOffset : 0;
    const prefix = `${index + 1}: `;
    const available = remaining - prefix.length - (output.length > 0 ? 1 : 0);
    if (available <= 0) {
      nextRead = { offset: index + 1, columnOffset: column };
      break;
    }
    let end = Math.min(line.length, column + available);
    // Never split a UTF-16 surrogate pair across model requests.
    if (
      end < line.length &&
      /[\uD800-\uDBFF]/.test(line.charAt(end - 1)) &&
      /[\uDC00-\uDFFF]/.test(line.charAt(end))
    )
      end--;
    const text = line.slice(column, end);
    output.push(prefix + text);
    remaining -= prefix.length + text.length + (output.length > 1 ? 1 : 0);
    endLine = index + 1;
    if (column + text.length < line.length) {
      clipped = true;
      nextRead = { offset: index + 1, columnOffset: column + text.length };
      break;
    }
  }
  if (!nextRead && endLine < lines.length) {
    nextRead = { offset: endLine + 1, columnOffset: 0 };
  }
  return {
    totalLines: lines.length,
    startLine: offset,
    endLine,
    columnOffset,
    content: output.join("\n"),
    clipped,
    ...(nextRead ? { nextRead } : {}),
  };
}
