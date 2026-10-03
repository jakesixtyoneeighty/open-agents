/**
 * Self-contained Node program shipped to the sandbox. A search snapshots its
 * candidate files and stores every result outside the workspace, so later
 * pages read stored entries (or resume the scan) instead of rerunning earlier
 * pages. Input travels through an SDK-written file, never shell interpolation.
 * Scanning is synchronous so a VM timeout can interrupt pathological regexes.
 * Tests run this exact source.
 */
export const WORKSPACE_SEARCH_WORKER = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const [rootInput, store, inputPath, outputPath] = process.argv.slice(1);
const MAX_FILE = 4 * 1024 * 1024;
const MAX_STORE = 32 * 1024 * 1024;
const MAX_CANDIDATES = 200000;
const MAX_BUDGET = 20000;
const MIN_FILE_MS = 1000;
const PAGE_CHARS = 16000;
const LINE_CHARS = 400;
const CONTEXT_CHARS = 200;
const SAMPLE = 20;
const RETENTION_MS = 6 * 60 * 60 * 1000;
const POSIX = {
  alpha: "a-zA-Z", digit: "0-9", alnum: "a-zA-Z0-9", upper: "A-Z", lower: "a-z",
  space: "\\s", blank: " \\t", xdigit: "0-9A-Fa-f", word: "\\w",
  punct: "!-\\/:-@\\[-\\x60{-~", cntrl: "\\x00-\\x1f\\x7f", print: "\\x20-\\x7e", graph: "\\x21-\\x7e",
};
const fail = message => { throw new Error(message); };
const root = fs.realpathSync(rootInput);
let id;
const stored = suffix => path.join(store, id + suffix);
const sensitive = name => path.posix.basename(name).toLowerCase().startsWith(".env");
const escapeChar = c => /[.*+?^$(){}|[\]\\\/]/.test(c) ? "\\" + c : c;
const isHigh = code => code >= 0xd800 && code <= 0xdbff;
const isLow = code => code >= 0xdc00 && code <= 0xdfff;
const byPath = (a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0);

function writeAtomic(filename, text) {
  const temporary = filename + "." + process.pid + "." + Date.now();
  fs.writeFileSync(temporary, text, { mode: 384 });
  fs.renameSync(temporary, filename);
}

function resolveBase(name, optional) {
  if (typeof name !== "string" || name.includes("\\") || name.includes("\0") || path.isAbsolute(name)) fail("Use a workspace-relative path.");
  const trimmed = name.replace(/^(\.\/)+/, "").replace(/\/+$/, "");
  const parts = trimmed === "" || trimmed === "." ? [] : trimmed.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) fail("Path must stay within the workspace and outside .git.");
  let current = root;
  let stat = fs.lstatSync(root);
  for (const part of parts) {
    current = path.join(current, part);
    try { stat = fs.lstatSync(current); }
    catch (error) {
      if (error.code === "ENOENT") { if (optional) return null; fail("Path does not exist: " + name); }
      throw error;
    }
    if (stat.isSymbolicLink()) fail("Symlinks are not followed: " + name);
  }
  if (!stat.isFile() && !stat.isDirectory()) fail("Path is not a regular file or directory: " + name);
  return { rel: parts.join("/"), abs: current, isFile: stat.isFile() };
}

function skip(meta, reason, rel) {
  const entry = meta.skipped[reason] || (meta.skipped[reason] = { count: 0, paths: [] });
  entry.count++;
  if (entry.paths.length < SAMPLE) entry.paths.push(rel);
}

function excludedSegment(segment, query) {
  return segment.toLowerCase() === ".git" ||
    (!query.includeHidden && segment.startsWith(".")) ||
    (!query.includeIgnored && segment === "node_modules");
}

const below = (base, rel) => (base.rel ? rel.slice(base.rel.length + 1) : rel);

function gitList(base) {
  try {
    const output = execFileSync("git", ["--literal-pathspecs", "-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", base.rel || "."], { maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    return [...new Set(output.toString("utf8").split("\0").filter(Boolean))];
  } catch { return null; }
}

/** Files below base, sorted by path, never following symlinks. */
function candidates(base, query, meta, accept) {
  if (base.isFile) return [{ rel: base.rel, stat: fs.lstatSync(base.abs) }];
  const out = [];
  const push = (rel, stat) => {
    if (out.length >= MAX_CANDIDATES) fail("More than 200000 files match; narrow the path or glob.");
    out.push({ rel, stat });
  };
  const listed = query.includeIgnored ? null : gitList(base);
  meta.respectsGitignore = listed !== null;
  if (listed) {
    const safe = new Map([[base.rel || ".", true]]);
    const dirSafe = dir => {
      if (safe.has(dir)) return safe.get(dir);
      let ok = dirSafe(path.posix.dirname(dir));
      if (ok) {
        try { const stat = fs.lstatSync(path.join(root, dir)); ok = stat.isDirectory() && !stat.isSymbolicLink(); }
        catch { ok = false; }
      }
      safe.set(dir, ok);
      return ok;
    };
    for (const rel of listed) {
      const relative = below(base, rel);
      if (relative.split("/").some(segment => excludedSegment(segment, query))) continue;
      if (!accept(relative)) continue;
      if (!dirSafe(path.posix.dirname(rel))) { skip(meta, "symlink", rel); continue; }
      let stat;
      try { stat = fs.lstatSync(path.join(root, rel)); } catch { continue; }
      if (stat.isSymbolicLink()) { skip(meta, "symlink", rel); continue; }
      if (stat.isFile()) push(rel, stat);
    }
  } else {
    const walk = (abs, rel) => {
      let entries;
      try { entries = fs.readdirSync(abs, { withFileTypes: true }); }
      catch { skip(meta, "unreadable", rel || "."); return; }
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const entry of entries) {
        if (excludedSegment(entry.name, query)) continue;
        const childRel = rel ? rel + "/" + entry.name : entry.name;
        const childAbs = path.join(abs, entry.name);
        if (entry.isDirectory()) { walk(childAbs, childRel); continue; }
        if (!entry.isFile() && !entry.isSymbolicLink()) continue;
        if (!accept(below(base, childRel))) continue;
        if (entry.isSymbolicLink()) { skip(meta, "symlink", childRel); continue; }
        try { push(childRel, fs.lstatSync(childAbs)); } catch {}
      }
    };
    walk(base.abs, base.rel);
  }
  return out.sort(byPath);
}

function globRegExp(glob) {
  if (typeof glob !== "string" || !glob || glob.length > 1000) fail("Glob must be 1–1000 characters.");
  let source = "";
  let depth = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "\\" && i + 1 < glob.length) { source += escapeChar(glob[++i]); continue; }
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const segmentStart = i === 0 || glob[i - 1] === "/";
        if (segmentStart && glob[i + 2] === "/") { source += "(?:[^/]*/)*"; i += 2; continue; }
        if (segmentStart && i + 2 === glob.length) { source += ".*"; i += 1; continue; }
        i += 1;
      }
      source += "[^/]*";
      continue;
    }
    if (c === "?") { source += "[^/]"; continue; }
    if (c === "[") {
      const close = glob.indexOf("]", i + 2);
      if (close !== -1) {
        let body = glob.slice(i + 1, close);
        const negate = body[0] === "!" || body[0] === "^";
        if (negate) body = body.slice(1);
        source += "[" + (negate ? "^/" : "") + body.replace(/[\\\]\[]/g, "\\$&") + "]";
        i = close;
        continue;
      }
    }
    if (c === "{") { depth++; source += "(?:"; continue; }
    if (c === "}" && depth > 0) { depth--; source += ")"; continue; }
    if (c === "," && depth > 0) { source += "|"; continue; }
    source += escapeChar(c);
  }
  if (depth) fail("Unbalanced braces in glob: " + glob);
  return new RegExp("^" + source + "$");
}

function compilePattern(query) {
  if (typeof query.pattern !== "string") fail("Pattern is required.");
  if (query.pattern.length > 10000) fail("Pattern exceeds 10000 characters.");
  const source = query.mode === "literal"
    ? query.pattern.replace(/[.*+?^$(){}|[\]\\\/]/g, "\\$&")
    : query.pattern.replace(/\[:([a-z]+):\]/g, (token, name) => POSIX[name] || token);
  const flags = query.caseSensitive ? "" : "i";
  try { return new RegExp(source, flags + "u"); } catch {}
  try { return new RegExp(source, flags); }
  catch (error) { fail("Invalid regular expression: " + error.message); }
}

/** Bounded window that never splits a UTF-16 surrogate pair. */
function windowText(line, start, max) {
  if (line.length <= max) return { content: line };
  let begin = Math.max(0, Math.min(start, line.length - max));
  if (begin > 0 && isLow(line.charCodeAt(begin)) && isHigh(line.charCodeAt(begin - 1))) begin--;
  let end = Math.min(line.length, begin + max);
  if (end < line.length && isHigh(line.charCodeAt(end - 1)) && isLow(line.charCodeAt(end))) end--;
  return { content: line.slice(begin, end), contentOffset: begin, truncated: true };
}

function scanFile(rel, query, pattern) {
  if (sensitive(rel)) return { skip: "sensitive" };
  const abs = path.join(root, rel);
  let stat;
  try { stat = fs.lstatSync(abs); } catch { return { skip: "unreadable" }; }
  if (stat.isSymbolicLink()) return { skip: "symlink" };
  if (!stat.isFile()) return { skip: "unreadable" };
  if (stat.size > MAX_FILE) return { skip: "tooLarge" };
  let bytes;
  try { bytes = fs.readFileSync(abs); } catch { return { skip: "unreadable" }; }
  if (bytes.subarray(0, 8192).includes(0)) return { skip: "binary" };
  const lines = bytes.toString("utf8").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const text = index => (lines[index].endsWith("\r") ? lines[index].slice(0, -1) : lines[index]);
  const contextLines = (from, to) => {
    const out = [];
    for (let index = Math.max(0, from); index < Math.min(lines.length, to); index++) {
      const { content, truncated } = windowText(text(index), 0, CONTEXT_CHARS);
      out.push(truncated ? { line: index + 1, content, truncated } : { line: index + 1, content });
    }
    return out;
  };
  const entries = [];
  let count = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = text(index);
    const match = pattern.exec(line);
    if (!match) continue;
    count++;
    if (query.output !== "content") continue;
    const windowStart = Math.max(0, match.index - 80);
    const entry = { file: rel, line: index + 1, column: match.index + 1, ...windowText(line, windowStart, LINE_CHARS) };
    if (query.before) entry.before = contextLines(index - query.before, index);
    if (query.after) entry.after = contextLines(index + 1, index + 1 + query.after);
    entries.push(entry);
  }
  if (count && query.output === "files") entries.push({ file: rel });
  if (count && query.output === "count") entries.push({ file: rel, count });
  return { count, entries };
}

/** Appends entries; returns false when the stored result limit would be exceeded. */
function append(meta, entries) {
  const lines = entries.map(entry => JSON.stringify(entry) + "\n");
  const size = lines.reduce((sum, line) => sum + Buffer.byteLength(line), 0);
  if (meta.bytes + size > MAX_STORE) { meta.limited = true; return false; }
  const index = Buffer.alloc(entries.length * 4);
  let offset = meta.bytes;
  lines.forEach((line, i) => { index.writeUInt32LE(offset, i * 4); offset += Buffer.byteLength(line); });
  fs.appendFileSync(stored(".jsonl"), lines.join(""), { mode: 384 });
  fs.appendFileSync(stored(".idx"), index, { mode: 384 });
  meta.bytes = offset;
  meta.storedEntries += entries.length;
  return true;
}

const vmContext = vm.createContext({ run: null });
const vmScript = new vm.Script("run()");

/** Scans until the target entry count or deadline; always makes progress. */
function scan(meta, files, pattern, deadline, target) {
  let progressed = false;
  while (meta.nextFile < files.length) {
    if (progressed && (meta.storedEntries >= target || Date.now() >= deadline)) break;
    const rel = files[meta.nextFile];
    let result;
    try {
      vmContext.run = () => scanFile(rel, meta.query, pattern);
      result = vmScript.runInContext(vmContext, { timeout: Math.max(MIN_FILE_MS, deadline - Date.now()) });
    } catch (error) {
      const timedOut = error && error.code === "ERR_SCRIPT_EXECUTION_TIMEOUT";
      // A later file may simply have inherited too little budget; retry it next call.
      if (timedOut && progressed) break;
      result = { skip: timedOut ? "timeout" : "unreadable" };
    }
    if (result.skip) skip(meta, result.skip, rel);
    else if (result.count) {
      if (!append(meta, result.entries)) break;
      meta.totalMatches += result.count;
      meta.totalFiles++;
    }
    meta.nextFile++;
    progressed = true;
  }
}

function readPage(meta, offset, limit) {
  const count = Math.min(limit, meta.storedEntries - offset);
  if (count <= 0) return [];
  const indexBytes = Buffer.alloc((count + 1) * 4);
  const indexFd = fs.openSync(stored(".idx"), "r");
  try { fs.readSync(indexFd, indexBytes, 0, indexBytes.length, offset * 4); } finally { fs.closeSync(indexFd); }
  const start = indexBytes.readUInt32LE(0);
  const end = offset + count < meta.storedEntries ? indexBytes.readUInt32LE(count * 4) : meta.bytes;
  const data = Buffer.alloc(end - start);
  const dataFd = fs.openSync(stored(".jsonl"), "r");
  try { fs.readSync(dataFd, data, 0, data.length, start); } finally { fs.closeSync(dataFd); }
  const entries = [];
  let chars = 0;
  for (const line of data.toString("utf8").split("\n")) {
    if (!line) continue;
    if (entries.length && chars + line.length > PAGE_CHARS) break;
    entries.push(JSON.parse(line));
    chars += line.length;
  }
  return entries;
}

function respond(meta, offset, limit) {
  const entries = readPage(meta, offset, limit);
  const next = offset + entries.length;
  const resumable = meta.query.kind === "content" && !meta.limited && meta.nextFile < meta.candidateFiles;
  const complete = !meta.limited && meta.nextFile >= meta.candidateFiles;
  return {
    success: true, searchId: id, query: meta.query, offset, entries,
    ...(next < meta.storedEntries || resumable ? { nextOffset: next } : {}),
    storedEntries: meta.storedEntries, totalMatches: meta.totalMatches, totalFiles: meta.totalFiles,
    scannedFiles: meta.nextFile, candidateFiles: meta.candidateFiles, respectsGitignore: meta.respectsGitignore,
    complete, ...(complete ? {} : { incompleteReason: meta.limited ? "result_limit" : "time_limit" }),
    skipped: meta.skipped,
  };
}

function normalizeQuery(query) {
  if (!query || typeof query !== "object") fail("Search query is required.");
  const flag = value => value === true;
  const span = value => (Number.isInteger(value) ? Math.min(20, Math.max(0, value)) : 0);
  const base = { path: typeof query.path === "string" ? query.path : "", includeHidden: flag(query.includeHidden), includeIgnored: flag(query.includeIgnored) };
  if (query.kind === "files") {
    if (typeof query.pattern !== "string" || !query.pattern) fail("Glob pattern is required.");
    return { kind: "files", ...base, pattern: query.pattern, sort: query.sort === "path" ? "path" : "modified" };
  }
  if (query.kind !== "content") fail("Unsupported search kind.");
  return {
    kind: "content", ...base, pattern: query.pattern,
    mode: query.mode === "literal" ? "literal" : "regex", caseSensitive: query.caseSensitive !== false,
    ...(typeof query.glob === "string" && query.glob ? { glob: query.glob } : {}),
    output: query.output === "files" || query.output === "count" ? query.output : "content",
    before: span(query.before), after: span(query.after),
  };
}

function startContent(query, deadline) {
  const pattern = compilePattern(query);
  const base = resolveBase(query.path);
  const meta = newMeta(query);
  let accept = () => true;
  if (query.glob) {
    const glob = globRegExp(query.glob);
    const basename = !query.glob.includes("/");
    accept = relative => glob.test(basename ? path.posix.basename(relative) : relative);
  }
  const files = candidates(base, query, meta, accept).map(candidate => candidate.rel);
  meta.candidateFiles = files.length;
  writeAtomic(stored(".files.json"), JSON.stringify(files));
  scan(meta, files, pattern, deadline, Infinity);
  return meta;
}

function startFiles(query) {
  const meta = newMeta(query);
  const normalized = query.pattern.replace(/^(\.\/)+/, "");
  if (normalized.startsWith("/")) fail("Use a glob relative to path.");
  // A literal directory prefix narrows the walk; a missing prefix simply has no matches.
  const segments = normalized.split("/");
  const prefix = [];
  while (segments.length > 1 && !/[*?[{\\]/.test(segments[0])) prefix.push(segments.shift());
  const baseInput = [query.path.replace(/^(\.\/)+/, "").replace(/\/+$/, ""), ...prefix].filter(part => part && part !== ".").join("/");
  const base = resolveBase(baseInput, true);
  const scoped = { ...query, includeHidden: query.includeHidden || /(^|\/)\.[^/]/.test(normalized) };
  let found = [];
  if (base && !base.isFile) {
    const glob = globRegExp(segments.join("/"));
    found = candidates(base, scoped, meta, relative => glob.test(relative));
  }
  if (query.sort === "modified") found.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs || byPath(a, b));
  const entries = found.map(({ rel, stat }) => ({ path: rel, size: stat.size, modifiedAt: new Date(stat.mtimeMs).toISOString() }));
  meta.candidateFiles = entries.length;
  if (append(meta, entries)) {
    meta.nextFile = entries.length;
    meta.totalMatches = meta.totalFiles = entries.length;
  }
  return meta;
}

function newMeta(query) {
  return { version: 1, query, createdAt: new Date().toISOString(), nextFile: 0, candidateFiles: 0, storedEntries: 0, bytes: 0, totalMatches: 0, totalFiles: 0, respectsGitignore: false, limited: false, skipped: {} };
}

function cleanup() {
  for (const name of fs.readdirSync(store)) {
    const filename = path.join(store, name);
    try { if (Date.now() - fs.statSync(filename).mtimeMs > RETENTION_MS) fs.unlinkSync(filename); } catch {}
  }
}

function loadMeta() {
  let meta;
  try { meta = JSON.parse(fs.readFileSync(stored(".meta.json"), "utf8")); }
  catch { fail("Search results are no longer available in this sandbox; run the search again."); }
  // Discard entries appended by an interrupted run that never saved its progress.
  for (const [suffix, size] of [[".jsonl", meta.bytes], [".idx", meta.storedEntries * 4]]) {
    try { if (fs.statSync(stored(suffix)).size > size) fs.truncateSync(stored(suffix), size); } catch {}
  }
  const now = new Date();
  for (const suffix of [".jsonl", ".idx", ".files.json"]) {
    try { fs.utimesSync(stored(suffix), now, now); } catch {}
  }
  return meta;
}

function run(request) {
  if (!request || typeof request.id !== "string" || !/^[a-f0-9]{32,64}$/.test(request.id)) fail("Invalid search id.");
  id = request.id;
  const limit = Number.isInteger(request.limit) ? Math.min(500, Math.max(1, request.limit)) : 100;
  const budget = Number.isFinite(request.budgetMs) ? Math.min(MAX_BUDGET, Math.max(0, request.budgetMs)) : MAX_BUDGET;
  const deadline = Date.now() + budget;
  fs.mkdirSync(store, { recursive: true, mode: 448 });
  if (request.action === "search") {
    // A retried tool call replays its stored first page.
    if (fs.existsSync(stored(".meta.json"))) return respond(loadMeta(), 0, limit);
    cleanup();
    const query = normalizeQuery(request.query);
    const meta = query.kind === "files" ? startFiles(query) : startContent(query, deadline);
    writeAtomic(stored(".meta.json"), JSON.stringify(meta));
    return respond(meta, 0, limit);
  }
  if (request.action !== "page") fail("Unsupported search action.");
  const meta = loadMeta();
  const offset = request.offset;
  if (!Number.isInteger(offset) || offset < 0 || offset > meta.storedEntries) fail("Cursor is outside these search results.");
  const resumable = meta.query.kind === "content" && !meta.limited && meta.nextFile < meta.candidateFiles;
  if (resumable && offset + limit > meta.storedEntries) {
    const files = JSON.parse(fs.readFileSync(stored(".files.json"), "utf8"));
    scan(meta, files, compilePattern(meta.query), deadline, offset + limit);
  }
  writeAtomic(stored(".meta.json"), JSON.stringify(meta));
  return respond(meta, offset, limit);
}

let result;
try { result = run(JSON.parse(fs.readFileSync(inputPath, "utf8"))); }
catch (error) { result = { success: false, error: error && error.message ? error.message : String(error) }; }
fs.writeFileSync(outputPath, JSON.stringify(result), { mode: 384 });
`;
