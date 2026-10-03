import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectChecks } from "./detect";
import { listChecks, runChecks } from "./run";
import { createLocalCheckSandbox } from "./test-sandbox";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

/** Prints a TypeScript-style error for every line containing BAD under src/. */
const CHECKER = `
const fs = require("fs");
let failed = false;
for (const name of fs.readdirSync("src").sort()) {
  fs.readFileSync("src/" + name, "utf8").split("\\n").forEach((text, index) => {
    if (text.includes("BAD")) {
      failed = true;
      console.log("src/" + name + "(" + (index + 1) + ",1): error TS9999: " + text.trim());
    }
  });
}
process.exit(failed ? 1 : 0);
`;

async function fixture(options: { git?: boolean } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "run-checks-"));
  directories.push(dir);
  const root = path.join(dir, "repo");
  await mkdir(path.join(root, "src"), { recursive: true });
  const put = (name: string, text: string) =>
    writeFile(path.join(root, name), text);
  await put(
    "package.json",
    JSON.stringify({
      packageManager: "npm@10.0.0",
      scripts: {
        typecheck: "node check.js",
        test: "echo 'mystery failure' >&2; exit 3",
        "test:slow": "sleep 5",
        "lint:fix": "echo never",
        generate: "echo generated > src/generated.txt",
      },
    }),
  );
  await put("check.js", CHECKER);
  await put("src/a.ts", "const a = 1; // BAD legacy\n");
  await put("src/b.ts", "export const b = 2;\n");
  if (options.git !== false) {
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        ["-c", "user.email=t@test", "-c", "user.name=t", ...args],
        {
          cwd: root,
        },
      );
    git("init", "-q");
    git("add", "-A");
    git("commit", "-qm", "init");
  }
  const sandbox = createLocalCheckSandbox(root, path.join(dir, "state"));
  const detected = await detectChecks(sandbox, "");
  const check = (id: string) => {
    const found =
      detected.checks.find((candidate) => candidate.id === id) ??
      detected.resolveScript(id);
    if (!found) throw new Error(`missing check ${id}`);
    return found;
  };
  const run = (ids: string[], timeoutMs = 30_000) =>
    runChecks({ sandbox, checks: ids.map(check), timeoutMs });
  return { root, put, sandbox, detected, check, run };
}

test("baselines classify existing vs new diagnostics, edits invalidate passes, fixes are reported", async () => {
  const f = await fixture();
  expect(
    f.detected.checks.map((check) => [
      check.id,
      check.kind,
      check.default,
      check.command,
    ]),
  ).toEqual([
    ["typecheck", "typecheck", true, "npm run typecheck"],
    ["test", "test", true, "npm run test"],
    ["test:slow", "test", false, "npm run test:slow"],
  ]);

  const baseline = await f.run(["typecheck"]);
  expect(baseline).toMatchObject({
    passed: false,
    dirty: false,
    revision: expect.any(String),
  });
  expect(baseline.checks[0]).toMatchObject({
    status: "failed",
    exitCode: 1,
    verdict: "failed_unclassified",
    baseline: null,
    diagnosticCount: 1,
    diagnostics: [
      { file: "src/a.ts", line: 1, code: "TS9999", changedFile: false },
    ],
    commandId: expect.any(String),
  });
  expect(baseline.checks[0]).not.toHaveProperty("output");

  await f.put("src/b.ts", "export const b = 2;\n// BAD new\n");
  const edited = await f.run(["typecheck"]);
  const result = edited.checks[0];
  expect(edited.dirty).toBe(true);
  expect(result?.verdict).toBe("new_and_existing_failures");
  expect(result?.baseline).toMatchObject({
    clean: true,
    newCount: 1,
    existingCount: 1,
    fixedCount: 0,
  });
  expect(
    result?.diagnostics.map((d) => [d.file, d.origin, d.changedFile]),
  ).toEqual([
    ["src/b.ts", "new", true],
    ["src/a.ts", "existing", false],
  ]);

  const typecheck = [f.check("typecheck")];
  expect(
    (await listChecks({ sandbox: f.sandbox, checks: typecheck })).checks[0]
      ?.latest,
  ).toMatchObject({
    status: "failed",
    current: true,
  });
  await f.put("src/a.ts", "const a = 1;\n");
  await f.put("src/b.ts", "export const b = 2;\n");
  expect(
    (await listChecks({ sandbox: f.sandbox, checks: typecheck })).checks[0]
      ?.latest,
  ).toMatchObject({
    current: false,
  });

  const fixed = await f.run(["typecheck"]);
  expect(fixed).toMatchObject({ passed: true });
  expect(fixed.checks[0]).toMatchObject({
    status: "passed",
    verdict: "fixed",
    baseline: { fixedCount: 1 },
  });
  const latest = (await listChecks({ sandbox: f.sandbox, checks: typecheck }))
    .checks[0]?.latest;
  expect(latest).toMatchObject({ status: "passed", current: true });
  // Any later edit makes the passing evidence stale.
  await f.put("src/c.ts", "export {};\n");
  expect(
    (await listChecks({ sandbox: f.sandbox, checks: typecheck })).checks[0]
      ?.latest,
  ).toMatchObject({
    status: "passed",
    current: false,
  });
}, 60_000);

test("unrecognized failures keep logs, timeouts are not code failures, mid-run changes are flagged", async () => {
  const f = await fixture();
  const results = await f.run(["test"]);
  expect(results.checks[0]).toMatchObject({
    status: "failed",
    exitCode: 3,
    diagnosticCount: 0,
    output: { stderr: expect.stringContaining("mystery failure") },
    commandId: expect.any(String),
  });
  const slow = await f.run(["test:slow"], 300);
  expect(slow.checks[0]).toMatchObject({
    status: "timed_out",
    exitCode: null,
    verdict: "not_completed",
  });
  const generating = await f.run(["generate"]);
  expect(generating.checks[0]).toMatchObject({
    status: "passed",
    revisionChanged: true,
  });
  expect(generating).toMatchObject({
    passed: false,
    note: expect.stringContaining("Files changed"),
  });
}, 60_000);

test("outside git, results run but are not bound to a revision", async () => {
  const f = await fixture({ git: false });
  const result = await f.run(["typecheck"]);
  expect(result).toMatchObject({
    passed: false,
    revision: null,
    note: expect.stringContaining("not a git repository"),
  });
  expect(result.checks[0]).toMatchObject({
    status: "failed",
    diagnosticCount: 1,
  });
}, 30_000);
