import { afterEach, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WorkspaceEditOperation } from "./types";
import { createLocalWorkspaceEditor } from "./test-harness";

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
  const dir = await mkdtemp(path.join(tmpdir(), "workspace-edit-"));
  directories.push(dir);
  const root = path.join(dir, "repo");
  const store = path.join(dir, "journals");
  await mkdir(root);
  const execute = createLocalWorkspaceEditor(root, store);
  const put = (name: string, text: string) =>
    writeFile(path.join(root, name), text);
  const get = (name: string) => readFile(path.join(root, name), "utf8");
  const apply = (operations: WorkspaceEditOperation[], dryRun = false) =>
    execute({ id: id(), operations, dryRun });
  return { root, store, execute, put, get, apply };
}

test("literal replacement tokens and ordered replacements preserve exact text", async () => {
  const f = await fixture();
  await f.put("a", "alpha alpha\nbeta");
  const result = await f.apply([
    {
      kind: "update",
      path: "a",
      edits: [
        { oldString: "alpha", newString: "$& $$ $` $'", replaceAll: true },
        { oldString: "beta", newString: "done" },
      ],
    },
  ]);
  expect(result.success).toBe(true);
  expect(await f.get("a")).toBe("$& $$ $` $' $& $$ $` $'\ndone");
});

test("separate processes serialize same-file updates and reject stale revisions", async () => {
  const f = await fixture();
  await f.put("a", "alpha beta");
  const results = await Promise.all([
    f.apply([
      {
        kind: "update",
        path: "a",
        edits: [{ oldString: "alpha", newString: "ONE" }],
      },
    ]),
    f.apply([
      {
        kind: "update",
        path: "a",
        edits: [{ oldString: "beta", newString: "TWO" }],
      },
    ]),
  ]);
  expect(results.every((result) => result.success)).toBe(true);
  expect(await f.get("a")).toBe("ONE TWO");
  const conflict = await f.apply([
    {
      kind: "update",
      path: "a",
      expectedRevision: hash("alpha beta"),
      edits: [{ oldString: "ONE", newString: "THREE" }],
    },
  ]);
  expect(conflict.success).toBe(false);
  expect(await f.get("a")).toBe("ONE TWO");
});

test("late-file preflight errors and dry runs change no files", async () => {
  const f = await fixture();
  await f.put("a", "one");
  await f.put("b", "duplicate duplicate");
  const invalid = await f.apply([
    {
      kind: "update",
      path: "a",
      edits: [{ oldString: "one", newString: "two" }],
    },
    {
      kind: "update",
      path: "b",
      edits: [{ oldString: "duplicate", newString: "unique" }],
    },
  ]);
  expect(invalid.success).toBe(false);
  expect(await f.get("a")).toBe("one");
  expect(
    (await f.apply([{ kind: "write", path: "a", content: "two" }], true))
      .success,
  ).toBe(true);
  expect(await f.get("a")).toBe("one");
});

test("create, delete, move, modes, idempotency, and undo preserve unrelated edits", async () => {
  const f = await fixture();
  await f.put("a", "original\n");
  await chmod(path.join(f.root, "a"), 0o755);
  await f.put("delete", "delete me");
  const changeId = id();
  const request = {
    id: changeId,
    operations: [
      {
        kind: "update" as const,
        path: "a",
        moveTo: "moved",
        expectedRevision: hash("original\n"),
      },
      {
        kind: "delete" as const,
        path: "delete",
        expectedRevision: hash("delete me"),
      },
      { kind: "create" as const, path: "new", content: "new" },
    ],
  };
  expect((await f.execute(request)).success).toBe(true);
  expect(await f.execute(request)).toMatchObject({
    success: true,
    replayed: true,
  });
  expect((await stat(path.join(f.root, "moved"))).mode & 0o777).toBe(0o755);
  await f.put("unrelated", "keep me");
  expect((await f.execute({ id: id(), undo: changeId })).success).toBe(true);
  expect(await f.get("a")).toBe("original\n");
  expect(await f.get("delete")).toBe("delete me");
  expect(await f.get("unrelated")).toBe("keep me");
  expect(await stat(path.join(f.root, "new")).catch(() => null)).toBeNull();
});

test("undo fails before restoring anything if one target changed", async () => {
  const f = await fixture();
  await f.put("a", "old");
  await f.put("b", "old");
  const result = await f.apply([
    { kind: "write", path: "a", content: "new" },
    { kind: "write", path: "b", content: "new" },
  ]);
  if (!result.success) throw new Error(result.error);
  await f.put("b", "user edit");
  expect(
    (await f.execute({ id: id(), undo: result.changeSetId })).success,
  ).toBe(false);
  expect(await f.get("a")).toBe("new");
  expect(await f.get("b")).toBe("user edit");
});

test("patch hunks preserve CRLF and EOF, and reject ambiguous context", async () => {
  const f = await fixture();
  await f.put("a", "first\r\nold\r\nlast\r\n");
  expect(
    (
      await f.apply([
        {
          kind: "update",
          path: "a",
          hunks: [
            { before: ["old", "last"], after: ["new", "last"], atEnd: true },
          ],
        },
      ])
    ).success,
  ).toBe(true);
  expect(await f.get("a")).toBe("first\r\nnew\r\nlast\r\n");
  await f.put("b", "same\nsame");
  expect(
    (
      await f.apply([
        {
          kind: "update",
          path: "b",
          hunks: [{ before: ["same"], after: ["other"] }],
        },
      ])
    ).success,
  ).toBe(false);
  expect(
    (
      await f.apply([
        {
          kind: "update",
          path: "b",
          hunks: [{ before: ["same"], after: ["other"], atEnd: true }],
        },
      ])
    ).success,
  ).toBe(true);
  expect(await f.get("b")).toBe("same\nother");
  await f.put("mixed", "one\r\ntwo\n");
  expect(
    await f.apply([
      {
        kind: "update",
        path: "mixed",
        hunks: [{ before: ["two"], after: ["three"] }],
      },
    ]),
  ).toMatchObject({ success: false });
  expect(await f.get("mixed")).toBe("one\r\ntwo\n");
});

test("rejects traversal, git, symlinks, sensitive files, binary files and oversized changes", async () => {
  const f = await fixture();
  await f.put("a", "original");
  await symlink(path.join(f.root, "a"), path.join(f.root, "link"));
  await f.put("binary", "x\0y");
  for (const name of [
    "../outside",
    ".git/config",
    "link",
    ".env.local",
    "binary",
  ]) {
    expect(
      (await f.apply([{ kind: "write", path: name, content: "changed" }]))
        .success,
    ).toBe(false);
  }
  expect(
    (
      await f.apply([
        { kind: "create", path: "huge", content: "x".repeat(262145) },
      ])
    ).success,
  ).toBe(false);
  expect(await f.get("a")).toBe("original");
});

test("write failure rolls back; incomplete rollback is explicit and recoverable", async () => {
  const f = await fixture();
  await f.put("a", "old");
  await f.put("b", "old");
  const operations: WorkspaceEditOperation[] = [
    { kind: "write", path: "a", content: "new" },
    { kind: "write", path: "b", content: "new" },
  ];
  const fault = `const io = require("node:fs/promises"); const originalRename = io.rename; let failed = false; io.rename = async (source, destination) => { if (destination === require("node:fs").realpathSync(process.argv[1]) + "/b") { failed = true; throw new Error("injected write failure"); } return originalRename(source, destination); };`;
  const result = await f.execute({ id: id(), operations }, fault);
  expect(result.success).toBe(false);
  expect(await f.get("a")).toBe("old");
  const brokenRollback = fault.replace(
    'if (destination === require("node:fs").realpathSync(process.argv[1]) + "/b")',
    'if (destination === require("node:fs").realpathSync(process.argv[1]) + "/b" || (failed && destination === require("node:fs").realpathSync(process.argv[1]) + "/a"))',
  );
  const partial = await f.execute({ id: id(), operations }, brokenRollback);
  expect(partial).toMatchObject({ success: false, rollbackFailedPaths: ["a"] });
  expect(await f.get("a")).toBe("new");
  expect(
    await f.apply([{ kind: "create", path: "preview", content: "no" }], true),
  ).toMatchObject({ success: false });
  expect(await f.get("a")).toBe("new");
  expect(
    (await f.apply([{ kind: "create", path: "next", content: "okay" }]))
      .success,
  ).toBe(true);
  expect(await f.get("a")).toBe("old");
});

test("recovery preserves externally changed files and blocks further writes", async () => {
  const f = await fixture();
  await f.put("a", "user content");
  await mkdir(f.store, { recursive: true });
  await writeFile(
    path.join(f.store, `${id()}.json`),
    JSON.stringify({
      status: "applying",
      files: [
        {
          path: "a",
          before: { text: "old", mode: 0o644 },
          after: { text: "new", mode: 0o644 },
        },
      ],
    }),
  );
  expect(
    await f.apply([{ kind: "create", path: "next", content: "no" }]),
  ).toMatchObject({ success: false, rollbackFailedPaths: ["a"] });
  expect(await f.get("a")).toBe("user content");
});

test("missing, empty and overlapping targets fail preflight without mutation", async () => {
  const f = await fixture();
  await f.put("a", "original");
  for (const oldString of ["", "absent"]) {
    expect(
      (
        await f.apply([
          {
            kind: "update",
            path: "a",
            edits: [{ oldString, newString: "replacement" }],
          },
        ])
      ).success,
    ).toBe(false);
  }
  expect(
    (
      await f.apply([
        { kind: "create", path: "parent", content: "x" },
        { kind: "create", path: "parent/child", content: "x" },
      ])
    ).success,
  ).toBe(false);
  expect(await stat(path.join(f.root, "parent")).catch(() => null)).toBeNull();
  expect(await f.get("a")).toBe("original");
});

test("approved legacy sensitive changes hide contents and refuse generic undo", async () => {
  const f = await fixture();
  const operationId = id();
  const result = await f.execute({
    id: operationId,
    allowSensitive: true,
    operations: [
      { kind: "write", path: ".env", content: "TOKEN=private-example" },
    ],
  });
  expect(result.success).toBe(true);
  expect(JSON.stringify(result)).not.toContain("private-example");
  expect((await f.execute({ id: id(), undo: operationId })).success).toBe(
    false,
  );
  expect(
    (
      await f.execute({
        id: operationId,
        operations: [{ kind: "write", path: "a", content: "different" }],
      })
    ).success,
  ).toBe(false);
});
