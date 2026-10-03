import { afterEach, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { LINE_DIFF_SOURCE } from "./line-diff-source";
import {
  createLocalWorkspaceEditor,
  createLocalWorkspaceHistoryReader,
} from "./test-harness";
import type { WorkspaceEditOperation, WorkspaceEditResult } from "./types";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const id = () => hash(randomUUID());
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "workspace-history-"));
  directories.push(dir);
  const root = path.join(dir, "repo");
  const store = path.join(dir, "journals");
  await mkdir(root);
  const execute = createLocalWorkspaceEditor(root, store);
  const history = createLocalWorkspaceHistoryReader(root, store);
  const put = (name: string, text: string) =>
    writeFile(path.join(root, name), text);
  const get = (name: string) => readFile(path.join(root, name), "utf8");
  const exists = (name: string) =>
    stat(path.join(root, name))
      .then(() => true)
      .catch(() => false);
  const apply = async (operations: WorkspaceEditOperation[]) => {
    const result = await execute({
      id: id(),
      operations,
      origin: { source: "agent", toolName: "multi_edit", scope: "s:c:build" },
    });
    if (!result.success) throw new Error(result.error);
    return result.changeSetId;
  };
  const edit = (name: string, oldString: string, newString: string) =>
    apply([{ kind: "update", path: name, edits: [{ oldString, newString }] }]);
  const preview = (changeSetId: string, scope: "change" | "checkpoint") =>
    execute({
      id: id(),
      dryRun: true,
      allowSensitive: true,
      revert: { changeSetId, scope },
    });
  const expectedFrom = (result: WorkspaceEditResult) =>
    result.success
      ? Object.fromEntries(
          result.changes.map((change) => [change.path, change.beforeRevision]),
        )
      : {};
  const restore = async (
    changeSetId: string,
    scope: "change" | "checkpoint",
  ) => {
    const planned = await preview(changeSetId, scope);
    return execute({
      id: id(),
      allowSensitive: true,
      origin: { source: "user", toolName: "restore" },
      revert: {
        changeSetId,
        scope,
        expectedRevisions: expectedFrom(planned),
      },
    });
  };
  const list = async () => {
    const result = await history({ history: "list" });
    if (!result.success || result.history !== "list")
      throw new Error("list failed");
    return result;
  };
  return {
    root,
    store,
    execute,
    history,
    put,
    get,
    exists,
    apply,
    edit,
    preview,
    restore,
    expectedFrom,
    list,
  };
}

const statuses = (result: WorkspaceEditResult) =>
  result.success
    ? Object.fromEntries(
        result.changes.map((change) => [change.path, change.revertStatus]),
      )
    : result.error;

test("history lists committed change sets newest first with origin, kinds and line stats", async () => {
  const f = await fixture();
  await f.put("a.ts", "one\ntwo\nthree\n");
  const first = await f.edit("a.ts", "two", "TWO\nextra");
  const second = await f.apply([
    { kind: "create", path: "b.ts", content: "new\n" },
    {
      kind: "delete",
      path: "a.ts",
      expectedRevision: hash("one\nTWO\nextra\nthree\n"),
    },
  ]);
  const failed = await f.execute({
    id: id(),
    operations: [
      {
        kind: "update",
        path: "b.ts",
        edits: [{ oldString: "missing", newString: "x" }],
      },
    ],
  });
  expect(failed.success).toBe(false);

  const listed = await f.list();
  expect(listed.entries.map((entry) => entry.changeSetId)).toEqual([
    second,
    first,
  ]);
  expect(listed.entries[1]).toMatchObject({
    origin: { source: "agent", toolName: "multi_edit", scope: "s:c:build" },
    status: "active",
    files: [{ path: "a.ts", kind: "updated", additions: 2, deletions: 1 }],
  });
  expect(listed.entries[0]?.files).toEqual([
    { path: "b.ts", kind: "created", additions: 1, deletions: 0 },
    { path: "a.ts", kind: "deleted", additions: 0, deletions: 4 },
  ]);
  expect(listed.retention).toMatchObject({
    maxEntries: 200,
    entries: 2,
    pruned: 0,
  });
  expect(listed.recoveryRequired).toEqual([]);

  const shown = await f.history({ history: "show", changeSetId: first });
  expect(shown).toMatchObject({
    success: true,
    changes: [
      {
        path: "a.ts",
        before: "one\ntwo\nthree\n",
        after: "one\nTWO\nextra\nthree\n",
      },
    ],
  });
  expect(
    await f.history({ history: "show", changeSetId: "f".repeat(64) }),
  ).toMatchObject({
    success: false,
    error: expect.stringContaining("unavailable"),
  });
});

test("reverting a change is exact, journaled, and a revert of the revert redoes it", async () => {
  const f = await fixture();
  await f.put("a.ts", "alpha\nbeta\n");
  await chmod(path.join(f.root, "a.ts"), 0o755);
  const change = await f.edit("a.ts", "beta", "BETA");

  const planned = await f.preview(change, "change");
  expect(statuses(planned)).toEqual({ "a.ts": "exact" });
  expect(await f.get("a.ts")).toBe("alpha\nBETA\n");

  const reverted = await f.restore(change, "change");
  expect(reverted.success).toBe(true);
  expect(await f.get("a.ts")).toBe("alpha\nbeta\n");
  expect((await stat(path.join(f.root, "a.ts"))).mode & 0o777).toBe(0o755);
  if (!reverted.success) return;

  let listed = await f.list();
  expect(listed.entries[0]).toMatchObject({
    changeSetId: reverted.changeSetId,
    reverts: [change],
    origin: { source: "user", toolName: "restore" },
    status: "active",
  });
  expect(listed.entries[1]).toMatchObject({
    changeSetId: change,
    status: "reverted",
    revertedBy: reverted.changeSetId,
  });

  const redo = await f.restore(reverted.changeSetId, "change");
  expect(redo.success).toBe(true);
  expect(await f.get("a.ts")).toBe("alpha\nBETA\n");
  listed = await f.list();
  expect(
    listed.entries.find((entry) => entry.changeSetId === change)?.status,
  ).toBe("active");
  expect(
    listed.entries.find((entry) => entry.changeSetId === reverted.changeSetId)
      ?.status,
  ).toBe("reverted");

  // Reverting something already reverted reports nothing to do.
  const again = await f.restore(redo.success ? redo.changeSetId : "", "change");
  expect(again.success).toBe(true);
  expect(
    await f.restore(redo.success ? redo.changeSetId : "", "change"),
  ).toMatchObject({
    success: false,
    error: expect.stringContaining("already reverted"),
  });
});

test("revert merges around later edits elsewhere in the file and preserves them", async () => {
  const f = await fixture();
  const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
  await f.put("a.ts", `${lines.join("\r\n")}\r\n`);
  const change = await f.edit("a.ts", "line 3", "line three");
  // An untracked shell-style edit far from the change.
  const later = (await f.get("a.ts")).replace("line 15", "line fifteen");
  await f.put("a.ts", later);

  const planned = await f.preview(change, "change");
  expect(statuses(planned)).toEqual({ "a.ts": "merged" });
  if (!planned.success) return;
  expect(planned.changes[0]?.before).toBe(later);
  expect(planned.changes[0]?.after).toBe(later.replace("line three", "line 3"));
  expect(planned.changes[0]?.beforeRevision).toBe(hash(later));

  const result = await f.restore(change, "change");
  expect(result.success).toBe(true);
  expect(await f.get("a.ts")).toBe(later.replace("line three", "line 3"));
  expect(await f.get("a.ts")).toContain("line fifteen\r\n");
});

test("restore refuses stale previews, missing previews and conflicts without writing", async () => {
  const f = await fixture();
  const original = "a\nb\nc\nd\ne\nf\ng\nh\n";
  await f.put("a.ts", original);
  const change = await f.apply([
    {
      kind: "update",
      path: "a.ts",
      edits: [{ oldString: "b", newString: "B" }],
    },
    { kind: "create", path: "new.ts", content: "fresh\n" },
  ]);
  const planned = await f.preview(change, "change");
  expect(statuses(planned)).toEqual({ "a.ts": "exact", "new.ts": "exact" });

  // Unrelated-region edit after the preview: revisions no longer match.
  await f.put("new.ts", "fresh\nmore\n");
  const stale = await f.execute({
    id: id(),
    allowSensitive: true,
    revert: {
      changeSetId: change,
      scope: "change",
      expectedRevisions: f.expectedFrom(planned),
    },
  });
  expect(stale).toMatchObject({
    success: false,
    error: expect.stringContaining("conflicts"),
  });
  expect(await f.get("a.ts")).toBe(original.replace("b", "B"));
  expect(await f.get("new.ts")).toBe("fresh\nmore\n");

  const conflicted = await f.preview(change, "change");
  expect(statuses(conflicted)).toEqual({
    "a.ts": "exact",
    "new.ts": "conflict",
  });
  if (!conflicted.success) return;
  expect(
    conflicted.changes.find((change) => change.path === "new.ts")?.reason,
  ).toContain("edited after this change created it");

  await f.put("new.ts", "fresh\n");
  expect(
    await f.execute({
      id: id(),
      allowSensitive: true,
      revert: { changeSetId: change, scope: "change" },
    }),
  ).toMatchObject({
    success: false,
    error: expect.stringContaining("Preview"),
  });
  const drift = `${original.replace("b", "B")}new tail\n`;
  await f.put("a.ts", drift);
  const drifted = await f.execute({
    id: id(),
    allowSensitive: true,
    revert: {
      changeSetId: change,
      scope: "change",
      expectedRevisions: f.expectedFrom(planned),
    },
  });
  expect(drifted).toMatchObject({
    success: false,
    error: expect.stringContaining("changed since the preview"),
  });
  expect(await f.get("a.ts")).toBe(drift);
  expect(await f.exists("new.ts")).toBe(true);

  // Overlapping edit: the changed line itself was edited again.
  await f.put("a.ts", original.replace("b", "B2"));
  expect(statuses(await f.preview(change, "change"))).toMatchObject({
    "a.ts": "conflict",
  });
});

test("checkpoint restore reverses later change sets newest first and keeps intermediate external edits", async () => {
  const f = await fixture();
  const body = Array.from({ length: 30 }, (_, i) => `row ${i}`).join("\n");
  await f.put("a.ts", `${body}\n`);
  await f.put("unrelated.ts", "keep\n");
  const first = await f.edit("a.ts", "row 1\n", "row one\n");
  const second = await f.apply([
    {
      kind: "update",
      path: "a.ts",
      edits: [{ oldString: "row 10\n", newString: "row ten\n" }],
    },
    { kind: "create", path: "b.ts", content: "b\n" },
  ]);
  // External edit between agent changes, far from both hunks.
  await f.put(
    "a.ts",
    (await f.get("a.ts")).replace("row 25", "row twenty-five"),
  );
  await f.put("unrelated.ts", "user edit\n");
  const third = await f.edit("a.ts", "row 20\n", "row twenty\n");
  const undo = await f.execute({ id: id(), undo: third });
  expect(undo.success).toBe(true);
  const fourth = await f.edit("b.ts", "b\n", "bb\n");

  const planned = await f.preview(second, "checkpoint");
  expect(statuses(planned)).toEqual({ "b.ts": "exact", "a.ts": "merged" });
  expect(planned).toMatchObject({
    reverts: [fourth, expect.any(String), third, second],
  });
  const restored = await f.restore(second, "checkpoint");
  expect(restored.success).toBe(true);
  expect(await f.exists("b.ts")).toBe(false);
  const text = await f.get("a.ts");
  expect(text).toContain("row one\n");
  expect(text).toContain("row 10\n");
  expect(text).toContain("row 20\n");
  expect(text).toContain("row twenty-five\n");
  expect(await f.get("unrelated.ts")).toBe("user edit\n");

  const listed = await f.list();
  const byId = new Map(
    listed.entries.map((entry) => [entry.changeSetId, entry]),
  );
  expect(byId.get(first)?.status).toBe("active");
  for (const changeSetId of [second, third, fourth])
    expect(byId.get(changeSetId)?.status).toBe("reverted");
  expect(listed.entries[0]?.reverts?.[0]).toBe(fourth);
  expect(listed.entries[0]?.reverts?.at(-1)).toBe(second);

  // The checkpoint restore is itself reversible.
  if (!restored.success) return;
  expect((await f.restore(restored.changeSetId, "change")).success).toBe(true);
  expect(await f.get("b.ts")).toBe("bb\n");
  expect(await f.get("a.ts")).toContain("row ten\n");
});

test("dotenv history stays redacted and needs a user-confirmed restore", async () => {
  const f = await fixture();
  await f.put(".env", "KEY=1\n");
  const result = await f.execute({
    id: id(),
    allowSensitive: true,
    operations: [
      {
        kind: "update",
        path: ".env",
        edits: [{ oldString: "1", newString: "2" }],
      },
    ],
  });
  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(
    await f.history({ history: "show", changeSetId: result.changeSetId }),
  ).toMatchObject({
    changes: [{ path: ".env", before: null, after: null, redacted: true }],
  });
  expect(
    await f.execute({
      id: id(),
      dryRun: true,
      revert: { changeSetId: result.changeSetId, scope: "change" },
    }),
  ).toMatchObject({ success: false, error: expect.stringContaining("dotenv") });
  const planned = await f.preview(result.changeSetId, "change");
  expect(planned).toMatchObject({
    success: true,
    changes: [
      {
        path: ".env",
        before: null,
        after: null,
        redacted: true,
        revertStatus: "exact",
      },
    ],
  });
  expect((await f.restore(result.changeSetId, "change")).success).toBe(true);
  expect(await f.get(".env")).toBe("KEY=1\n");
});

test("phase 1 journals are listed, retention prunes oldest first, and pending recovery is reported", async () => {
  const f = await fixture();
  await f.put("a.ts", "x\n");
  await mkdir(f.store, { recursive: true });
  const legacy: string[] = [];
  for (let i = 0; i < 200; i++) {
    const legacyId = hash(`legacy-${i}`);
    legacy.push(legacyId);
    const filename = path.join(f.store, `${legacyId}.json`);
    await writeFile(
      filename,
      JSON.stringify({
        digest: "d",
        status: "committed",
        files: [
          {
            path: `old-${i}.ts`,
            before: { text: null, mode: null },
            after: { text: "x\n", mode: 420 },
          },
        ],
        result: {},
      }),
    );
    const at = new Date(Date.UTC(2026, 0, 1, 0, 0, i));
    await utimes(filename, at, at);
  }
  const rolledBack = hash("rolled-back");
  await writeFile(
    path.join(f.store, `${rolledBack}.json`),
    JSON.stringify({
      digest: "d",
      status: "rolled_back",
      files: [],
      result: {},
    }),
  );
  const old = new Date(Date.UTC(2025, 0, 1));
  await utimes(path.join(f.store, `${rolledBack}.json`), old, old);

  let listed = await f.list();
  expect(listed.entries).toHaveLength(200);
  expect(listed.entries.at(-1)?.changeSetId).toBe(legacy[0]);
  expect(listed.entries[0]).toMatchObject({
    changeSetId: legacy[199],
    origin: null,
  });

  const latest = await f.edit("a.ts", "x", "y");
  listed = await f.list();
  expect(listed.entries).toHaveLength(200);
  expect(listed.entries[0]?.changeSetId).toBe(latest);
  expect(listed.entries.at(-1)?.changeSetId).toBe(legacy[1]);
  expect(listed.retention).toMatchObject({ entries: 200, pruned: 1 });
  const names = await readdir(f.store);
  expect(names).not.toContain(`${legacy[0]}.json`);
  expect(names).not.toContain(`${rolledBack}.json`);
  expect(await f.preview(legacy[0] ?? "", "change")).toMatchObject({
    success: false,
    error: expect.stringContaining("unavailable"),
  });

  const pending = hash("pending");
  await writeFile(
    path.join(f.store, `${pending}.json`),
    JSON.stringify({ digest: "d", status: "applying", files: [], result: {} }),
  );
  expect((await f.list()).recoveryRequired).toEqual([pending]);
});

test("context hunks reproduce the target exactly for arbitrary line edits", () => {
  const fail = (message: string) => {
    throw new Error(message);
  };
  const { contextHunks, applyContextHunks, lineStats } = runInNewContext(
    `${LINE_DIFF_SOURCE}; ({ contextHunks, applyContextHunks, lineStats })`,
    { fail },
  ) as {
    contextHunks: (a: string, b: string) => unknown[];
    applyContextHunks: (text: string, hunks: unknown[]) => string;
    lineStats: (
      a: string | null,
      b: string | null,
    ) => { additions: number; deletions: number };
  };
  let seed = 7;
  const random = (limit: number) => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed % limit;
  };
  for (let round = 0; round < 300; round++) {
    // Unique source lines: repeated context is a conflict by design.
    const source = Array.from({ length: 1 + random(40) }, (_, i) => `v${i}`);
    const target = [...source];
    for (let edits = random(6); edits > 0; edits--) {
      const at = random(target.length + 1);
      if (random(2)) target.splice(at, 1);
      else target.splice(at, 0, `n${random(1000)}${random(2) ? "\r" : ""}`);
    }
    const from = source.join("\n") + (random(2) ? "\n" : "");
    const to = target.join("\n") + (random(2) ? "\n" : "");
    expect(applyContextHunks(from, contextHunks(from, to))).toBe(to);
  }
  expect(lineStats("a\nb\nc", "a\nB\nc\nd")).toEqual({
    additions: 2,
    deletions: 1,
  });
});
