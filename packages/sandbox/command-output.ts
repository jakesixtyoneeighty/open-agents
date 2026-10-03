/** Preserve diagnostics at both ends; complete output remains in the SDK log. */
export function previewCommandOutput(output: string, limit: number) {
  const boundedLimit = Math.min(50_000, Math.max(1000, Math.floor(limit)));
  if (output.length <= boundedLimit) return { output, truncated: false };
  const notice =
    "\n[... omitted; use command_output to read the complete log ...]\n";
  let head = Math.floor((boundedLimit - notice.length) / 2);
  const tail = boundedLimit - notice.length - head;
  let tailStart = output.length - tail;
  if (splitsPair(output, head)) head--;
  if (splitsPair(output, tailStart)) tailStart++;
  return {
    output: output.slice(0, head) + notice + output.slice(tailStart),
    truncated: true,
  };
}

export function commandOutputWindow(
  output: string,
  offset: number,
  limit: number,
) {
  let start = Math.max(0, Math.floor(offset));
  if (splitsPair(output, start)) start--;
  let end = Math.min(
    output.length,
    start + Math.min(16_000, Math.max(2, Math.floor(limit))),
  );
  if (splitsPair(output, end)) end--;
  return {
    content: output.slice(start, end),
    totalCharacters: output.length,
    offset: start,
    ...(end < output.length ? { nextOffset: end } : {}),
  };
}

/** Leading output for parsers; the SDK log keeps the complete streams. */
export function leadingOutput(stdout: string, stderr: string, limit: number) {
  const bounded = Math.min(5_000_000, Math.max(1000, Math.floor(limit)));
  const clip = (text: string) => {
    let end = Math.min(text.length, bounded);
    if (splitsPair(text, end)) end--;
    return text.slice(0, end);
  };
  return {
    stdout: clip(stdout),
    stderr: clip(stderr),
    truncated: stdout.length > bounded || stderr.length > bounded,
  };
}

function splitsPair(text: string, index: number) {
  return (
    /[\uD800-\uDBFF]/.test(text.charAt(index - 1)) &&
    /[\uDC00-\uDFFF]/.test(text.charAt(index))
  );
}
