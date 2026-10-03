/**
 * Line diff and strict inverse-hunk application, shipped inside the edit
 * worker. Lines are split on "\n" only, so "\r" and the trailing-newline state
 * stay part of the compared text and joins reproduce input exactly.
 */
export const LINE_DIFF_SOURCE = String.raw`
const DIFF_CONTEXT = 3;
const MAX_DIFF_EDITS = 2000;
const splitLines = text => text.split("\n");

// Myers diff over the trimmed middle. Returns matched [a, b] index pairs, or
// null when the edit distance exceeds MAX_DIFF_EDITS (callers then treat the
// whole middle as one replaced block, which is correct but coarser).
function myersPairs(a, b, offset) {
  const n = a.length, m = b.length, limit = Math.min(n + m, MAX_DIFF_EDITS);
  const mid = limit + 1, v = new Int32Array(2 * limit + 3), trace = [];
  for (let d = 0; d <= limit; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[mid + k - 1] < v[mid + k + 1]) ? v[mid + k + 1] : v[mid + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[mid + k] = x;
      if (x >= n && y >= m) {
        trace.push(v.slice(mid - d, mid + d + 1));
        const pairs = [];
        let px = n, py = m;
        for (let step = trace.length - 1; step > 0; step--) {
          const previous = trace[step - 1], at = kk => previous[kk + step - 1], kk = px - py;
          const prevK = kk === -step || (kk !== step && at(kk - 1) < at(kk + 1)) ? kk + 1 : kk - 1;
          const prevX = at(prevK), prevY = prevX - prevK;
          while (px > prevX && py > prevY) { px--; py--; pairs.push([px + offset, py + offset]); }
          px = prevX; py = prevY;
        }
        while (px > 0 && py > 0) { px--; py--; pairs.push([px + offset, py + offset]); }
        return pairs.reverse();
      }
    }
    trace.push(v.slice(mid - d, mid + d + 1));
  }
  return null;
}

// Changed regions as { a0, a1, b0, b1 }: lines a[a0..a1) become b[b0..b1).
function diffBlocks(a, b) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const pairs = myersPairs(a.slice(start, endA), b.slice(start, endB), start) ?? [];
  const blocks = [];
  let i = start, j = start;
  for (const [x, y] of [...pairs, [endA, endB]]) {
    if (x > i || y > j) blocks.push({ a0: i, a1: x, b0: j, b1: y });
    i = x + 1; j = y + 1;
  }
  return blocks;
}

const lineCount = text => (text === "" ? 0 : splitLines(text).length - (text.endsWith("\n") ? 1 : 0));

function lineStats(beforeText, afterText) {
  if (beforeText === afterText) return { additions: 0, deletions: 0 };
  if (beforeText === null) return { additions: lineCount(afterText), deletions: 0 };
  if (afterText === null) return { additions: 0, deletions: lineCount(beforeText) };
  let additions = 0, deletions = 0;
  for (const block of diffBlocks(splitLines(beforeText), splitLines(afterText))) {
    deletions += block.a1 - block.a0;
    additions += block.b1 - block.b0;
  }
  return { additions, deletions };
}

// Hunks that turn fromText into toText, each carrying up to DIFF_CONTEXT
// unchanged lines on both sides. Hunks whose context would overlap merge.
function contextHunks(fromText, toText) {
  const a = splitLines(fromText), b = splitLines(toText), hunks = [];
  for (const block of diffBlocks(a, b)) {
    const last = hunks[hunks.length - 1];
    if (last && block.a0 - last.a1 <= 2 * DIFF_CONTEXT) { last.a1 = block.a1; last.b1 = block.b1; continue; }
    hunks.push({ ...block });
  }
  return hunks.map(hunk => {
    const lead = Math.min(DIFF_CONTEXT, hunk.a0), tail = Math.min(DIFF_CONTEXT, a.length - hunk.a1);
    return {
      before: a.slice(hunk.a0 - lead, hunk.a1 + tail),
      after: b.slice(hunk.b0 - lead, hunk.b1 + tail),
    };
  });
}

// Applies hunks in order with exact, unique context. Throws on any mismatch so
// callers report a conflict instead of guessing.
function applyContextHunks(text, hunks) {
  const lines = splitLines(text);
  let cursor = 0;
  for (const hunk of hunks) {
    if (!hunk.before.length) fail("Change has no surrounding context to match.");
    const matches = [];
    for (let i = cursor; i <= lines.length - hunk.before.length; i++) {
      if (hunk.before.every((line, j) => line === lines[i + j])) matches.push(i);
    }
    if (matches.length !== 1) fail(matches.length ? "The changed lines appear more than once." : "The changed lines were edited again afterwards.");
    lines.splice(matches[0], hunk.before.length, ...hunk.after);
    cursor = matches[0] + hunk.after.length;
  }
  return lines.join("\n");
}
`;
