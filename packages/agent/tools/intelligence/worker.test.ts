import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  realpath,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalWorkspaceEditor } from "../../../sandbox/workspace-edit/test-harness";
import { INTELLIGENCE_WORKER } from "./worker";
import { intelligenceResultSchema } from "./schema";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
const runtime = path.resolve(import.meta.dir, "../../../..");
async function fixture() {
  const temp = await realpath(
    await mkdtemp(path.join(tmpdir(), "intelligence-")),
  );
  dirs.push(temp);
  const root = path.join(temp, "repo");
  await mkdir(root);
  const put = (name: string, text: string) =>
    writeFile(path.join(root, name), text);
  await put(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: { target: "ESNext", module: "ESNext", strict: true },
      include: ["*.ts"],
    }),
  );
  await put(
    "source.ts",
    "export const original = 1;\nexport const object = { original };\n",
  );
  await put(
    "consumer.ts",
    'import { original } from "./source";\nconst use = original;\nfunction shadow(original: number) { return original; }\nconst text = "original"; // original\n',
  );
  execFileSync("git", ["init", "-q", root]);
  const worker = path.join(temp, "worker.cjs");
  await writeFile(worker, INTELLIGENCE_WORKER);
  const query = async (input: Record<string, unknown>, rename = false) => {
    const request = path.join(temp, "request.json");
    const output = `${request}.result`;
    await writeFile(
      request,
      JSON.stringify({
        input: {
          filePath: "source.ts",
          line: 1,
          column: 15,
          action: "references",
          limit: 100,
          ...input,
        },
        rename,
      }),
    );
    execFileSync("node", [worker, root, runtime, request, output], {
      timeout: 30_000,
    });
    return intelligenceResultSchema.parse(
      JSON.parse(await readFile(output, "utf8")),
    );
  };
  return { root, temp, put, query };
}

test("real language service resolves imports, symbols and semantic references with revision", async () => {
  const f = await fixture();
  const refs = await f.query({});
  expect(refs).toMatchObject({ success: true });
  expect(refs.revision).toMatch(/^[a-f0-9]{40,64}$/);
  expect(refs.locations).toHaveLength(4);
  expect(refs.locations?.some((item) => item.line === 3)).toBe(false);
  const defs = await f.query({
    action: "definitions",
    filePath: "consumer.ts",
    line: 2,
    column: 14,
  });
  expect(defs.locations?.[0]?.path).toBe("source.ts");
  const symbols = await f.query({ action: "symbols", line: 1, column: 1 });
  expect(symbols.locations?.some((item) => item.name === "original")).toBe(
    true,
  );
  const bounded = await f.query({ limit: 1 });
  expect(bounded.truncated).toBe(true);
  expect(bounded.omitted).toBe(3);
}, 30_000);

test("rename preserves shadowed identifiers, comments and shorthand; shared engine previews, applies and undoes", async () => {
  const f = await fixture();
  const initial = await f.query({});
  const plan = await f.query(
    { newName: "renamed", expectedRevision: initial.revision },
    true,
  );
  expect(plan).toMatchObject({ success: true });
  expect(plan.operations).toHaveLength(2);
  const source = plan.operations?.find((item) => item.path === "source.ts");
  expect(source?.content).toContain("{ original: renamed }");
  const consumer = plan.operations?.find((item) => item.path === "consumer.ts");
  expect(consumer?.content).toContain(
    "function shadow(original: number) { return original; }",
  );
  expect(consumer?.content).toContain('"original"; // original');
  const edit = createLocalWorkspaceEditor(f.root, path.join(f.temp, "edits"));
  const request = {
    id: "a".repeat(64),
    operations: plan.operations ?? [],
    expectedWorkspaceRevision: plan.revision ?? undefined,
  };
  const preview = await edit({ ...request, dryRun: true });
  expect(preview.success).toBe(true);
  expect(await readFile(path.join(f.root, "source.ts"), "utf8")).toContain(
    "const original",
  );
  const applied = await edit(request);
  expect(applied.success).toBe(true);
  expect(await readFile(path.join(f.root, "source.ts"), "utf8")).toContain(
    "const renamed",
  );
  const replay = await edit(request);
  expect(replay.success && replay.replayed).toBe(true);
  expect((await edit({ id: "b".repeat(64), undo: request.id })).success).toBe(
    true,
  );
  expect(await readFile(path.join(f.root, "source.ts"), "utf8")).toContain(
    "const original",
  );
}, 30_000);

test("stale workspace edits outside rename targets prevent mutation under the edit lock", async () => {
  const f = await fixture();
  const plan = await f.query({ newName: "renamed" }, true);
  expect(plan).toMatchObject({ success: true });
  await f.put("unrelated.ts", "export const changed = 1;");
  const stale = await f.query(
    { newName: "renamed", expectedRevision: plan.revision },
    true,
  );
  expect(stale.availability).toBe("stale");
  const edit = createLocalWorkspaceEditor(f.root, path.join(f.temp, "edits"));
  const result = await edit({
    id: "c".repeat(64),
    operations: plan.operations ?? [],
    expectedWorkspaceRevision: plan.revision ?? undefined,
  });
  expect(result.success).toBe(false);
  expect(await readFile(path.join(f.root, "source.ts"), "utf8")).toContain(
    "const original",
  );
}, 30_000);

test("unsupported, excluded, sensitive and linked files never become semantic results", async () => {
  const f = await fixture();
  expect((await f.query({ filePath: "other.py" })).availability).toBe(
    "unsupported",
  );
  expect((await f.query({ filePath: "../outside.ts" })).success).toBe(false);
  await f.put(".env.ts", "export const SECRET = 1;");
  expect((await f.query({ filePath: ".env.ts" })).success).toBe(false);
  await symlink(path.join(f.root, "source.ts"), path.join(f.root, "linked.ts"));
  expect((await f.query({ filePath: "linked.ts" })).success).toBe(false);
  expect((await f.query({ newName: "class" }, true)).success).toBe(false);
  expect((await f.query({ line: 5000 })).success).toBe(false);
}, 30_000);

test("ignored semantic inputs are checked under the edit lock too", async () => {
  const f = await fixture();
  await f.put(".gitignore", "ignored.ts\n");
  await f.put("ignored.ts", "export const unrelated = 1;\n");
  const plan = await f.query({ newName: "renamed" }, true);
  expect(plan).toMatchObject({ success: true });
  expect(Object.keys(plan.readRevisions ?? {})).toContain("ignored.ts");
  await f.put("ignored.ts", "export const unrelated = 2;\n");
  const edit = createLocalWorkspaceEditor(f.root, path.join(f.temp, "edits"));
  const result = await edit({
    id: "d".repeat(64),
    operations: plan.operations ?? [],
    expectedWorkspaceRevision: plan.revision ?? undefined,
    readRevisions: plan.readRevisions,
  });
  expect(result).toMatchObject({ success: false });
  expect(await readFile(path.join(f.root, "source.ts"), "utf8")).toContain(
    "const original",
  );
}, 30_000);

test("read-only intelligence never invokes Git hooks or configured clean filters", async () => {
  const f = await fixture();
  const hook = path.join(f.root, ".git/hooks/post-index-change");
  await writeFile(hook, "#!/bin/sh\nprintf called > hook-called\n", {
    mode: 0o755,
  });
  expect((await f.query({})).success).toBe(true);
  expect(
    await readFile(path.join(f.root, "hook-called"), "utf8").catch(() => null),
  ).toBeNull();
  execFileSync("git", [
    "-C",
    f.root,
    "config",
    "filter.trap.clean",
    "touch filter-called",
  ]);
  await f.put(".gitattributes", "*.ts filter=trap\n");
  expect((await f.query({})).success).toBe(false);
  expect(
    await readFile(path.join(f.root, "filter-called"), "utf8").catch(
      () => null,
    ),
  ).toBeNull();
}, 30_000);

test("filter safety preserves whitespace in filenames and filter names", async () => {
  const f = await fixture();
  await f.put(" odd.ts", "export const odd = 1;\n");
  execFileSync("git", [
    "-C",
    f.root,
    "config",
    "filter.odd name.clean",
    "touch filter-called",
  ]);
  await f.put(".gitattributes", '" odd.ts" filter=trap\n');
  expect((await f.query({})).success).toBe(false);
  expect(
    await readFile(path.join(f.root, "filter-called"), "utf8").catch(
      () => null,
    ),
  ).toBeNull();
}, 30_000);
