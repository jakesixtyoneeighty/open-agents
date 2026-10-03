/**
 * Self-contained Node program shipped to the sandbox. Input travels through an
 * SDK-written file, never shell interpolation. Linux flock owns the lock across
 * hosts/processes and releases it on process death. Tests run this exact source.
 */
export const WORKSPACE_EDIT_WORKER = String.raw`
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const [rootInput, store, inputPath, outputPath] = process.argv.slice(1);
const hash = value => createHash("sha256").update(value).digest("hex");
const MAX_FILE = 256 * 1024;
const MAX_TOTAL = 2 * 1024 * 1024;
const sensitive = name => path.basename(name).toLowerCase().startsWith(".env");
const fail = message => { throw new Error(message); };
let root;

async function target(name) {
  if (typeof name !== "string" || !name || name.includes("\\") || name.includes("\0") || path.isAbsolute(name)) fail("Use workspace-relative file paths.");
  const parts = name.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) fail("Path must stay within the workspace and outside .git.");
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) fail("Symlinks are not supported: " + name);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return current;
}

async function read(name) {
  const filename = await target(name);
  try {
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.nlink > 1) fail("Only regular, unlinked text files are supported: " + name);
    if (stat.size > MAX_FILE) fail("File exceeds 256 KiB: " + name);
    const bytes = await fs.readFile(filename);
    const text = bytes.toString("utf8");
    if (bytes.includes(0) || !Buffer.from(text).equals(bytes)) fail("Binary or invalid UTF-8 file: " + name);
    return { text, mode: stat.mode & 4095 };
  } catch (error) {
    if (error.code === "ENOENT") return { text: null, mode: null };
    throw error;
  }
}

function same(a, b) { return a.text === b.text && a.mode === b.mode; }

async function write(name, state) {
  const filename = await target(name);
  if (state.text === null) { await fs.unlink(filename); return; }
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await target(name);
  const temporary = path.join(path.dirname(filename), ".open-agents-" + randomUUID());
  try {
    await fs.writeFile(temporary, state.text, { mode: state.mode ?? 420, flag: "wx" });
    await fs.chmod(temporary, state.mode ?? 420);
    await fs.rename(temporary, filename);
  } finally { await fs.unlink(temporary).catch(() => {}); }
}

async function saveJournal(id, journal) {
  const filename = path.join(store, id + ".json");
  const temporary = filename + "." + randomUUID();
  await fs.writeFile(temporary, JSON.stringify(journal), { mode: 384, flag: "wx" });
  await fs.rename(temporary, filename);
}

async function rollback(journal) {
  const failures = [];
  for (const change of [...journal.files].reverse()) {
    try {
      const current = await read(change.path);
      if (same(current, change.before)) continue;
      if (!same(current, change.after)) fail("File changed outside this operation");
      await write(change.path, change.before);
    } catch { failures.push(change.path); }
  }
  return failures;
}

function replace(text, edit) {
  if (typeof edit.oldString !== "string" || !edit.oldString) fail("oldString must not be empty");
  if (typeof edit.newString !== "string" || edit.oldString === edit.newString) fail("oldString and newString must be different");
  const count = text.split(edit.oldString).length - 1;
  if (!count) fail("oldString not found in file");
  if (count > 1 && !edit.replaceAll) fail("oldString found " + count + " times. Use replaceAll=true or provide more context to make it unique.");
  return {
    text: edit.replaceAll ? text.replaceAll(edit.oldString, () => edit.newString) : text.replace(edit.oldString, () => edit.newString),
    replacements: edit.replaceAll ? count : 1,
    startLine: text.slice(0, text.indexOf(edit.oldString)).split("\n").length,
  };
}

function applyHunks(text, hunks) {
  if (text.includes("\r\n") && text.replaceAll("\r\n", "").includes("\n")) fail("Mixed line endings are unsupported by apply_patch; use multi_edit to preserve them.");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const trailing = text.endsWith("\n");
  const lines = text === "" ? [] : text.replaceAll("\r\n", "\n").split("\n");
  if (trailing) lines.pop();
  let cursor = 0;
  for (const hunk of hunks) {
    if (!Array.isArray(hunk.before) || !Array.isArray(hunk.after)) fail("Invalid patch hunk");
    const matches = [];
    for (let i = cursor; i <= lines.length - hunk.before.length; i++) {
      if (hunk.atEnd && i + hunk.before.length !== lines.length) continue;
      if (hunk.before.every((line, j) => line === lines[i + j])) matches.push(i);
    }
    if (matches.length !== 1) fail(matches.length ? "Ambiguous patch context; add more unchanged lines." : "Patch context not found; read the file again.");
    const start = matches[0];
    lines.splice(start, hunk.before.length, ...hunk.after);
    cursor = start + hunk.after.length;
  }
  return lines.join(eol) + (trailing && lines.length ? eol : "");
}

async function run(request) {
  root = await fs.realpath(rootInput);
  if (!/^[a-f0-9]{64}$/.test(request.id)) fail("Invalid operation ID");
  await fs.mkdir(store, { recursive: true, mode: 448 });
  // A killed process releases flock. Recover its journal before accepting work.
  for (const name of await fs.readdir(store)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const journal = JSON.parse(await fs.readFile(path.join(store, name), "utf8"));
    if (journal.status !== "applying" && journal.status !== "recovery_required") continue;
    if (request.dryRun) return { success: false, error: "An interrupted edit needs recovery before preview; no workspace files were changed.", changeSetId: name.slice(0, -5), rollbackFailedPaths: journal.files.map(file => file.path) };
    const failures = await rollback(journal);
    journal.status = failures.length ? "recovery_required" : "rolled_back";
    await saveJournal(name.slice(0, -5), journal);
    if (failures.length) return { success: false, error: "An interrupted edit needs recovery; conflicting files were preserved.", changeSetId: name.slice(0, -5), rollbackFailedPaths: failures };
  }
  const digest = hash(JSON.stringify(request));
  const journalPath = path.join(store, request.id + ".json");
  try {
    const prior = JSON.parse(await fs.readFile(journalPath, "utf8"));
    if (prior.digest !== digest) fail("Operation ID was already used for different input.");
    if (prior.status === "committed") return { ...prior.result, replayed: true };
    if (prior.status === "rolled_back") fail("This operation was rolled back. Read current files and submit a new operation.");
  } catch (error) { if (error.code !== "ENOENT") throw error; }

  const files = [];
  let replacements = 0;
  let startLine;
  if (request.undo) {
    if (!/^[a-f0-9]{64}$/.test(request.undo)) fail("Invalid change set ID");
    let previous;
    try { previous = JSON.parse(await fs.readFile(path.join(store, request.undo + ".json"), "utf8")); }
    catch { fail("Change set is unavailable in this sandbox."); }
    if (previous.status !== "committed") fail("Only completed changes can be undone.");
    for (const change of previous.files) {
      if (sensitive(change.path)) fail("Undo of sensitive files requires a new approved single-file edit.");
      files.push({ path: change.path, before: change.after, after: change.before });
    }
  } else {
    if (!Array.isArray(request.operations) || !request.operations.length || request.operations.length > 25) fail("Use 1–25 file operations.");
    const seen = new Set();
    for (const operation of request.operations) {
      for (const name of [operation.path, operation.moveTo].filter(value => value !== undefined)) {
        await target(name);
        if ([...seen].some(existing => existing === name || existing.startsWith(name + "/") || name.startsWith(existing + "/"))) fail("Each path may appear only once per operation; group its replacements together.");
        if (sensitive(name) && !request.allowSensitive) fail("Batch edits cannot modify dotenv files. Use an approved single-file edit.");
        seen.add(name);
      }
      const before = await read(operation.path);
      if (operation.expectedRevision && (before.text === null || hash(before.text) !== operation.expectedRevision)) fail("File changed since it was read: " + operation.path);
      if (operation.kind === "create" && before.text !== null) fail("File already exists: " + operation.path);
      if ((operation.kind === "update" || operation.kind === "delete") && before.text === null) fail("File does not exist: " + operation.path);
      let text;
      if (operation.kind === "create" || operation.kind === "write") text = operation.content;
      else if (operation.kind === "delete") text = null;
      else if (operation.kind === "update") {
        text = before.text;
        if (operation.edits) {
          if (!operation.edits.length || operation.edits.length > 100) fail("Use 1–100 replacements per file.");
          for (const edit of operation.edits) {
            const result = replace(text, edit);
            text = result.text;
            replacements += result.replacements;
            startLine ??= result.startLine;
          }
        } else if (operation.hunks) text = applyHunks(text, operation.hunks);
        else if (!operation.moveTo) fail("Update requires edits or patch hunks.");
      } else fail("Unsupported file operation");
      if (text !== null && (typeof text !== "string" || Buffer.byteLength(text) > MAX_FILE || text.includes("\0") || Buffer.from(text).toString("utf8") !== text)) fail("Only UTF-8 text up to 256 KiB per file is supported.");
      if (operation.moveTo) {
        const destination = await read(operation.moveTo);
        if (destination.text !== null) fail("Move destination already exists: " + operation.moveTo);
        files.push({ path: operation.path, before, after: { text: null, mode: null } });
        files.push({ path: operation.moveTo, before: destination, after: { text, mode: before.mode ?? 420 } });
      } else files.push({ path: operation.path, before, after: { text, mode: text === null ? null : before.mode ?? 420 } });
    }
  }
  if (files.reduce((sum, file) => sum + Buffer.byteLength(file.before.text ?? "") + Buffer.byteLength(file.after.text ?? ""), 0) > MAX_TOTAL) fail("Change set exceeds 2 MiB; split it into smaller operations.");
  for (const change of files) {
    if (!same(await read(change.path), change.before)) fail("File changed since this operation: " + change.path);
  }
  const result = {
    success: true, changeSetId: request.id, dryRun: Boolean(request.dryRun), replacements,
    ...(startLine === undefined ? {} : { startLine }),
    changes: files.map(file => ({
      path: file.path,
      before: sensitive(file.path) ? null : file.before.text,
      after: sensitive(file.path) ? null : file.after.text,
      beforeRevision: file.before.text === null ? null : hash(file.before.text),
      afterRevision: file.after.text === null ? null : hash(file.after.text),
      ...(sensitive(file.path) ? { redacted: true } : {}),
    })),
  };
  if (request.dryRun) return result;
  const journal = { digest, status: "applying", files, result };
  await saveJournal(request.id, journal);
  try {
    for (const change of files) {
      if (!same(await read(change.path), change.before)) fail("File changed during edit: " + change.path);
      if (!same(change.before, change.after)) await write(change.path, change.after);
    }
    journal.status = "committed";
    await saveJournal(request.id, journal);
    return result;
  } catch (error) {
    const failures = await rollback(journal);
    journal.status = failures.length ? "recovery_required" : "rolled_back";
    await saveJournal(request.id, journal);
    return { success: false, error: error.message + (failures.length ? "; rollback incomplete; conflicting files preserved." : "; file contents rolled back."), changeSetId: request.id, ...(failures.length ? { rollbackFailedPaths: failures } : {}) };
  }
}

(async () => {
  let result;
  try { result = await run(JSON.parse(await fs.readFile(inputPath, "utf8"))); }
  catch (error) { result = { success: false, error: error.message }; }
  await fs.writeFile(outputPath, JSON.stringify(result), { mode: 384 });
})().catch(() => { process.exitCode = 1; });
`;
