import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalWorkspaceSearcher } from "./test-harness";
import type {
  WorkspaceSearchEntry,
  WorkspaceSearchQuery,
  WorkspaceSearchResult,
} from "./types";

const id = () => createHash("sha256").update(randomUUID()).digest("hex");
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

type ContentOptions = Partial<
  Omit<Extract<WorkspaceSearchQuery, { kind: "content" }>, "kind">
>;
type FilesOptions = Partial<
  Omit<Extract<WorkspaceSearchQuery, { kind: "files" }>, "kind">
>;

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "workspace-search-"));
  directories.push(dir);
  const root = path.join(dir, "repo");
  const store = path.join(dir, "store");
  await mkdir(root);
  const execute = createLocalWorkspaceSearcher(root, store);
  const put = async (name: string, text: string | Buffer) => {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), text);
  };
  const content = (
    pattern: string,
    options: ContentOptions = {},
    extra: { limit?: number; budgetMs?: number } = {},
  ) =>
    execute({
      id: id(),
      action: "search",
      limit: extra.limit ?? 100,
      budgetMs: extra.budgetMs,
      query: {
        kind: "content",
        path: "",
        pattern,
        mode: "regex",
        caseSensitive: true,
        output: "content",
        before: 0,
        after: 0,
        includeHidden: false,
        includeIgnored: false,
        ...options,
      },
    });
  const files = (pattern: string, options: FilesOptions = {}) =>
    execute({
      id: id(),
      action: "search",
      limit: 100,
      query: {
        kind: "files",
        path: "",
        pattern,
        sort: "path",
        includeHidden: false,
        includeIgnored: false,
        ...options,
      },
    });
  const page = (
    searchId: string,
    offset: number,
    limit = 100,
    budgetMs?: number,
  ) => execute({ id: searchId, action: "page", offset, limit, budgetMs });
  return { root, store, put, content, files, page };
}

function ok(result: WorkspaceSearchResult) {
  if (!result.success) throw new Error(result.error);
  return result;
}

const lines = (result: WorkspaceSearchResult) =>
  ok(result).entries.map((entry) =>
    "line" in entry ? `${entry.file}:${entry.line}:${entry.content}` : "",
  );
const paths = (result: WorkspaceSearchResult) =>
  ok(result).entries.map((entry) =>
    "path" in entry ? entry.path : entry.file,
  );

test("literal mode matches metacharacters exactly and regex mode keeps POSIX classes", async () => {
  const f = await fixture();
  await f.put("a.ts", "call(a.b)\ncallXaYb\nfoo  bar\n");
  expect(lines(await f.content("call(a.b)", { mode: "literal" }))).toEqual([
    "a.ts:1:call(a.b)",
  ]);
  expect(lines(await f.content("foo[[:space:]]+bar"))).toEqual([
    "a.ts:3:foo  bar",
  ]);
  expect(lines(await f.content("\\s+bar"))).toEqual(["a.ts:3:foo  bar"]);
  expect(
    lines(
      await f.content("CALLXAYB", { mode: "literal", caseSensitive: false }),
    ),
  ).toEqual(["a.ts:2:callXaYb"]);
  expect(await f.content("(unclosed")).toMatchObject({
    success: false,
    error: expect.stringContaining("Invalid regular expression"),
  });
});

test("context lines, CRLF stripping, columns and file/count outputs", async () => {
  const f = await fixture();
  await f.put("a.txt", "one\r\ntwo\r\nneedle here\r\nfour\r\nneedle\r\n");
  await f.put("b.txt", "needle\n");
  const result = ok(await f.content("needle", { before: 1, after: 1 }));
  expect(result.entries[0]).toEqual({
    file: "a.txt",
    line: 3,
    column: 1,
    content: "needle here",
    before: [{ line: 2, content: "two" }],
    after: [{ line: 4, content: "four" }],
  });
  expect(result.entries[1]).toMatchObject({ line: 5, after: [] });
  expect(result).toMatchObject({ totalMatches: 3, totalFiles: 2 });
  expect(ok(await f.content("needle", { output: "files" })).entries).toEqual([
    { file: "a.txt" },
    { file: "b.txt" },
  ]);
  expect(ok(await f.content("needle", { output: "count" })).entries).toEqual([
    { file: "a.txt", count: 2 },
    { file: "b.txt", count: 1 },
  ]);
  expect(ok(await f.content("e", { path: "b.txt" })).entries).toEqual([
    { file: "b.txt", line: 1, column: 2, content: "needle" },
  ]);
});

test("pages enumerate every match exactly once from the stored snapshot", async () => {
  const f = await fixture();
  for (let file = 0; file < 5; file++) {
    await f.put(
      `src/f${file}.ts`,
      Array.from({ length: 50 }, (_, line) => `hit ${file}-${line}`).join("\n"),
    );
  }
  const first = ok(await f.content("hit", {}, { limit: 100 }));
  expect(first).toMatchObject({ totalMatches: 250, complete: true });
  expect(first.entries).toHaveLength(100);
  // Later pages come from storage: workspace edits after the scan do not change them.
  await f.put("src/f4.ts", "rewritten");
  const seen = [...lines(first)];
  let next = first.nextOffset;
  while (next !== undefined) {
    const page = ok(await f.page(first.searchId, next));
    seen.push(...lines(page));
    next = page.nextOffset;
  }
  expect(seen).toHaveLength(250);
  expect(new Set(seen).size).toBe(250);
  expect(seen).toContain("src/f4.ts:50:hit 4-49");
  expect(await f.page(first.searchId, 251)).toMatchObject({ success: false });
});

test("pages stay within the character budget and long lines are Unicode-safe windows", async () => {
  const f = await fixture();
  const long = "😀".repeat(300) + "needle" + "😀".repeat(300);
  await f.put("long.txt", Array.from({ length: 80 }, () => long).join("\n"));
  const result = ok(await f.content("needle", {}, { limit: 500 }));
  expect(result.entries.length).toBeLessThan(80);
  expect(JSON.stringify(result.entries).length).toBeLessThanOrEqual(16_000);
  expect(result.nextOffset).toBe(result.entries.length);
  const entry = result.entries[0] as Extract<
    WorkspaceSearchEntry,
    { line: number; column: number }
  >;
  expect(entry.truncated).toBe(true);
  expect(entry.column).toBe(601);
  expect(entry.content).toContain("needle");
  expect(entry.content).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
  expect(long.slice(entry.contentOffset).startsWith(entry.content)).toBe(true);
});

test("globs use full-path semantics for files and basename filters for content", async () => {
  const f = await fixture();
  await f.put("a.ts", "x");
  await f.put("b.tsx", "x");
  await f.put("src/c.ts", "x");
  await f.put("src/deep/d.ts", "x");
  await f.put("src/[id]/page.ts", "x");
  await f.put("src/e.json", "x");
  expect(paths(await f.files("*.ts"))).toEqual(["a.ts"]);
  expect(paths(await f.files("**/*.ts"))).toEqual([
    "a.ts",
    "src/[id]/page.ts",
    "src/c.ts",
    "src/deep/d.ts",
  ]);
  expect(paths(await f.files("src/*.{ts,json}"))).toEqual([
    "src/c.ts",
    "src/e.json",
  ]);
  expect(paths(await f.files("src/**"))).toHaveLength(4);
  expect(paths(await f.files("?.ts*"))).toEqual(["a.ts", "b.tsx"]);
  expect(paths(await f.files("*.ts", { path: "src/[id]" }))).toEqual([
    "src/[id]/page.ts",
  ]);
  expect(paths(await f.files("missing/**/*.ts"))).toEqual([]);
  expect(
    paths(await f.content("x", { glob: "*.ts", output: "files" })),
  ).toEqual(["a.ts", "src/[id]/page.ts", "src/c.ts", "src/deep/d.ts"]);
  expect(
    paths(await f.content("x", { glob: "src/*.ts", output: "files" })),
  ).toEqual(["src/c.ts"]);
  expect(await f.files("{a,b")).toMatchObject({ success: false });
});

test("hidden, gitignored and node_modules files are excluded unless requested", async () => {
  const f = await fixture();
  execFileSync("git", ["init", "-q"], { cwd: f.root });
  await f.put(".gitignore", "dist/\n");
  await f.put("src/a.ts", "token");
  await f.put("dist/out.js", "token");
  await f.put("node_modules/pkg/index.js", "token");
  await f.put(".github/ci.yml", "token");
  const visible = ok(await f.content("token", { output: "files" }));
  expect(paths(visible)).toEqual(["src/a.ts"]);
  expect(visible.respectsGitignore).toBe(true);
  expect(
    paths(await f.content("token", { output: "files", includeHidden: true })),
  ).toEqual([".github/ci.yml", "src/a.ts"]);
  expect(
    paths(await f.content("token", { output: "files", includeIgnored: true })),
  ).toEqual(["dist/out.js", "node_modules/pkg/index.js", "src/a.ts"]);
  expect(paths(await f.files(".github/*.yml"))).toEqual([".github/ci.yml"]);
  expect(
    paths(await f.content("token", { path: ".github", output: "files" })),
  ).toEqual([".github/ci.yml"]);
});

test("workspace, symlink, sensitive, binary and size policies are explicit", async () => {
  const f = await fixture();
  const outside = path.join(path.dirname(f.root), "outside");
  await mkdir(outside);
  await writeFile(path.join(outside, "secret.ts"), "token");
  await f.put("a.ts", "token");
  await f.put(".env.local", "token=1");
  await f.put("bin.dat", Buffer.from([116, 111, 107, 101, 110, 0, 1]));
  await f.put("big.txt", "token\n".repeat(800_000));
  await symlink(outside, path.join(f.root, "linked"));
  await symlink(path.join(f.root, "a.ts"), path.join(f.root, "alias.ts"));
  const result = ok(
    await f.content("token", { output: "files", includeHidden: true }),
  );
  expect(paths(result)).toEqual(["a.ts"]);
  expect(result.skipped).toEqual({
    binary: { count: 1, paths: ["bin.dat"] },
    sensitive: { count: 1, paths: [".env.local"] },
    symlink: { count: 2, paths: ["alias.ts", "linked"] },
    tooLarge: { count: 1, paths: ["big.txt"] },
  });
  expect(JSON.stringify(result)).not.toContain("token=1");
  expect(ok(await f.content("token", { path: ".env.local" })).entries).toEqual(
    [],
  );
  for (const bad of [
    "../outside",
    "linked",
    "linked/secret.ts",
    ".git",
    "/etc",
  ]) {
    expect(await f.content("token", { path: bad })).toMatchObject({
      success: false,
    });
  }
});

test("time limits resume the scan across pages and skip a file that alone exhausts its budget", async () => {
  const f = await fixture();
  for (let file = 0; file < 6; file++)
    await f.put(`f${file}.txt`, "hit\nhit\n");
  const first = ok(await f.content("hit", {}, { budgetMs: 0, limit: 1 }));
  expect(first).toMatchObject({
    complete: false,
    incompleteReason: "time_limit",
    scannedFiles: 1,
    candidateFiles: 6,
  });
  const seen = [...lines(first)];
  let next = first.nextOffset;
  let last = first;
  while (next !== undefined) {
    last = ok(await f.page(first.searchId, next, 1, 0));
    seen.push(...lines(last));
    next = last.nextOffset;
  }
  expect(seen).toHaveLength(12);
  expect(new Set(seen).size).toBe(12);
  expect(last).toMatchObject({ complete: true, totalMatches: 12 });

  await f.put("evil.txt", "a".repeat(5000) + "b");
  const redos = ok(
    await f.content("(a+)+$", { path: "evil.txt" }, { budgetMs: 0 }),
  );
  expect(redos).toMatchObject({
    complete: true,
    skipped: { timeout: { count: 1, paths: ["evil.txt"] } },
  });
}, 20_000);

test("expired results and retried requests are explicit", async () => {
  const f = await fixture();
  await f.put("a.txt", "hit");
  const searchId = id();
  const request = {
    id: searchId,
    action: "search" as const,
    limit: 10,
    query: {
      kind: "files" as const,
      path: "",
      pattern: "*.txt",
      sort: "path" as const,
      includeHidden: false,
      includeIgnored: false,
    },
  };
  const execute = createLocalWorkspaceSearcher(f.root, f.store);
  const first = ok(await execute(request));
  await f.put("b.txt", "hit");
  expect(ok(await execute(request))).toEqual(first);
  await rm(f.store, { recursive: true, force: true });
  expect(await f.page(searchId, 0)).toMatchObject({
    success: false,
    error: expect.stringContaining("no longer available"),
  });
  expect(await f.page("not-hex", 0)).toMatchObject({ success: false });
});
