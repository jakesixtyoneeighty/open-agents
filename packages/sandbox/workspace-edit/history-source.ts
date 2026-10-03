/**
 * Change-set history for the edit worker: a journal index, retention,
 * revert planning and history reads. Runs inside the worker under its OS lock
 * and relies on the worker's read/same/sensitive/describeChange helpers.
 */
export const HISTORY_SOURCE = String.raw`
const HISTORY_INDEX = "history.json";
const MAX_HISTORY_ENTRIES = 200;
const MAX_HISTORY_BYTES = 64 * 1024 * 1024;
const ROLLED_BACK_RETENTION_MS = 24 * 60 * 60 * 1000;
const JOURNAL_NAME = /^[a-f0-9]{64}\.json$/;
const CHANGE_SET_ID = /^[a-f0-9]{64}$/;

const readJournal = id => fs.readFile(path.join(store, id + ".json"), "utf8").then(JSON.parse);
const revisionOf = state => (state.text === null ? null : hash(state.text));

function indexEntry(id, journal, bytes, mtimeMs) {
  return {
    changeSetId: id,
    committedAt: journal.committedAt ?? Math.round(mtimeMs),
    sequence: journal.sequence ?? 0,
    origin: journal.origin ?? null,
    ...(journal.reverts?.length ? { reverts: journal.reverts } : {}),
    bytes,
    files: journal.files.filter(file => !same(file.before, file.after)).map(file => ({
      path: file.path,
      kind: file.before.text === null ? "created" : file.after.text === null ? "deleted" : "updated",
      ...lineStats(file.before.text, file.after.text),
    })),
  };
}

const sortEntries = entries => entries.sort((a, b) => a.committedAt - b.committedAt || a.sequence - b.sequence);

// The index is a cache of committed journals. Reconcile it with the journal
// files so phase 1 journals, older workers and interrupted index saves all
// appear. Returns journals that still need recovery.
async function loadIndex() {
  let index;
  try { index = JSON.parse(await fs.readFile(path.join(store, HISTORY_INDEX), "utf8")); } catch {}
  if (index?.version !== 1 || !Array.isArray(index.entries) || !Array.isArray(index.rolledBack)) {
    index = { version: 1, sequence: 0, pruned: 0, entries: [], rolledBack: [] };
  }
  const names = new Set((await fs.readdir(store)).filter(name => JOURNAL_NAME.test(name)).map(name => name.slice(0, -5)));
  index.entries = index.entries.filter(entry => names.has(entry.changeSetId));
  index.rolledBack = index.rolledBack.filter(item => names.has(item.id));
  const known = new Set([...index.entries.map(entry => entry.changeSetId), ...index.rolledBack.map(item => item.id)]);
  const pending = [];
  for (const id of names) {
    if (known.has(id)) continue;
    const filename = path.join(store, id + ".json");
    const journal = JSON.parse(await fs.readFile(filename, "utf8"));
    const { mtimeMs, size } = await fs.stat(filename);
    if (journal.status === "committed") index.entries.push(indexEntry(id, journal, size, mtimeMs));
    else if (journal.status === "rolled_back") index.rolledBack.push({ id, at: Math.round(mtimeMs) });
    else pending.push({ id, journal });
  }
  sortEntries(index.entries);
  for (const entry of index.entries) index.sequence = Math.max(index.sequence, entry.sequence);
  return { index, pending };
}

async function saveIndex(index) {
  const filename = path.join(store, HISTORY_INDEX);
  const temporary = filename + "." + randomUUID();
  await fs.writeFile(temporary, JSON.stringify(index), { mode: 384, flag: "wx" });
  await fs.rename(temporary, filename);
}

// Oldest first, so every change set newer than an available one stays
// available and checkpoint restores never skip a gap.
async function pruneHistory(index) {
  let bytes = index.entries.reduce((sum, entry) => sum + entry.bytes, 0);
  while (index.entries.length > MAX_HISTORY_ENTRIES || (bytes > MAX_HISTORY_BYTES && index.entries.length > 1)) {
    const oldest = index.entries.shift();
    await fs.unlink(path.join(store, oldest.changeSetId + ".json")).catch(() => {});
    bytes -= oldest.bytes;
    index.pruned++;
  }
  const now = Date.now(), kept = [];
  for (const item of index.rolledBack) {
    if (now - item.at > ROLLED_BACK_RETENTION_MS) await fs.unlink(path.join(store, item.id + ".json")).catch(() => {});
    else kept.push(item);
  }
  index.rolledBack = kept;
}

async function recordCommit(index, id, journal) {
  const { mtimeMs, size } = await fs.stat(path.join(store, id + ".json"));
  index.entries.push(indexEntry(id, journal, size, mtimeMs));
  sortEntries(index.entries);
  await pruneHistory(index);
  await saveIndex(index);
}

async function recordRollback(index, id) {
  index.rolledBack.push({ id, at: Date.now() });
  await saveIndex(index);
}

// An entry is reverted while a later, still-active entry reverses it.
// Reverting a revert reactivates what that revert had reversed.
function historyStatuses(entries) {
  const byId = new Map(entries.map(entry => [entry.changeSetId, entry]));
  const revertedBy = new Map();
  for (const entry of entries) {
    revertedBy.set(entry.changeSetId, null);
    for (const id of entry.reverts ?? []) {
      if (!revertedBy.has(id)) continue;
      revertedBy.set(id, entry.changeSetId);
      for (const inner of byId.get(id).reverts ?? []) {
        if (revertedBy.get(inner) === id) revertedBy.set(inner, null);
      }
    }
  }
  return revertedBy;
}

function publicEntries(index) {
  const revertedBy = historyStatuses(index.entries);
  return index.entries.map(({ bytes, sequence, ...entry }) => ({
    ...entry,
    status: revertedBy.get(entry.changeSetId) ? "reverted" : "active",
    ...(revertedBy.get(entry.changeSetId) ? { revertedBy: revertedBy.get(entry.changeSetId) } : {}),
  }));
}

async function readHistory(request, index, pending) {
  if (request.history === "list") {
    return {
      success: true,
      history: "list",
      entries: publicEntries(index).reverse(),
      retention: {
        maxEntries: MAX_HISTORY_ENTRIES,
        maxBytes: MAX_HISTORY_BYTES,
        entries: index.entries.length,
        bytes: index.entries.reduce((sum, entry) => sum + entry.bytes, 0),
        pruned: index.pruned,
      },
      recoveryRequired: pending.map(item => item.id),
    };
  }
  if (request.history !== "show" || !CHANGE_SET_ID.test(request.changeSetId)) fail("Invalid history request");
  const entry = publicEntries(index).find(item => item.changeSetId === request.changeSetId);
  if (!entry) fail("Change set is unavailable in this sandbox.");
  const journal = await readJournal(request.changeSetId);
  return {
    success: true,
    history: "show",
    entry,
    changes: journal.files.filter(file => !same(file.before, file.after)).map(describeChange),
  };
}

// Reverse one recorded file change on top of the current state. Exact when the
// file still matches the recorded result; otherwise strict inverse hunks.
function invertChange(change, current) {
  const { before, after } = change;
  if (same(before, after) || same(current, before)) return { state: current, status: "unchanged" };
  if (same(current, after)) return { state: before, status: "exact" };
  if (after.text === null) return { reason: "File was recreated after this change." };
  if (current.text === null) return { reason: "File was deleted after this change." };
  if (before.text === null) return { reason: "File was edited after this change created it; reverting would delete those edits." };
  try {
    const text = applyContextHunks(current.text, contextHunks(after.text, before.text));
    return { state: { text, mode: current.mode === after.mode ? before.mode : current.mode }, status: "merged" };
  } catch (error) {
    return { reason: error.message };
  }
}

async function planRevert(request, index) {
  const revert = request.revert;
  if (!revert || !CHANGE_SET_ID.test(revert.changeSetId)) fail("Invalid change set ID");
  if (revert.scope !== "change" && revert.scope !== "checkpoint") fail("Invalid restore scope");
  const position = index.entries.findIndex(entry => entry.changeSetId === revert.changeSetId);
  if (position < 0) fail("Change set is unavailable in this sandbox. It may have been pruned or recorded in a different sandbox.");
  const chain = (revert.scope === "change" ? [index.entries[position]] : index.entries.slice(position)).reverse();
  const states = new Map();
  for (const entry of chain) {
    const journal = await readJournal(entry.changeSetId);
    for (const change of [...journal.files].reverse()) {
      if (sensitive(change.path) && !request.allowSensitive) fail("Restoring dotenv files requires a user-confirmed restore.");
      let item = states.get(change.path);
      if (!item) {
        try {
          const initial = await read(change.path);
          item = { initial, current: initial, statuses: [] };
        } catch (error) {
          item = { initial: { text: null, mode: null }, current: null, statuses: [], reason: error.message, unreadable: true };
        }
        states.set(change.path, item);
      }
      if (item.reason) continue;
      const outcome = invertChange(change, item.current);
      if (outcome.reason) item.reason = outcome.reason;
      else { item.current = outcome.state; item.statuses.push(outcome.status); }
    }
  }
  const files = [], changes = [], conflicts = [];
  for (const [name, item] of states) {
    const status = item.reason ? "conflict" : same(item.current, item.initial) ? "unchanged" : item.statuses.includes("merged") ? "merged" : "exact";
    const result = status === "conflict" ? item.initial : item.current;
    if (status === "conflict") conflicts.push(name);
    else if (status !== "unchanged") files.push({ path: name, before: item.initial, after: result });
    changes.push({
      ...describeChange({ path: name, before: item.initial, after: result }),
      ...(item.unreadable ? { before: null, after: null, beforeRevision: null, afterRevision: null } : {}),
      revertStatus: status,
      ...(item.reason ? { reason: item.reason } : {}),
    });
  }
  if (!request.dryRun) {
    const expected = revert.expectedRevisions;
    if (!expected || typeof expected !== "object") fail("Preview the restore before applying it.");
    if (conflicts.length) fail("Restore has conflicts and was not applied: " + conflicts.join(", "));
    const names = [...states.keys()];
    if (Object.keys(expected).length !== names.length || names.some(name => !Object.hasOwn(expected, name) || expected[name] !== revisionOf(states.get(name).initial))) {
      fail("Files changed since the preview. Preview the restore again.");
    }
    if (!files.length) fail("Nothing to restore; these changes are already reverted.");
  }
  return { files, changes, reverts: chain.map(entry => entry.changeSetId) };
}
`;
