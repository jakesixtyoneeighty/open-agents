import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isRecognizedCheckName } from "../run-checks";
import { detectChecks } from "./detect";
import { createLocalCheckSandbox } from "./test-sandbox";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function workspace(files: Record<string, string>) {
  const root = await mkdtemp(path.join(tmpdir(), "detect-checks-"));
  directories.push(root);
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  }
  return createLocalCheckSandbox(root, path.join(root, ".state"));
}

const summary = (
  checks: { id: string; kind: string; command: string; default: boolean }[],
) =>
  checks.map(
    ({ id, kind, command, default: isDefault }) =>
      `${id}|${kind}|${command}|${isDefault}`,
  );

test("package scripts use the workspace package manager, skip aliases and non-check scripts", async () => {
  const sandbox = await workspace({
    "pnpm-lock.yaml": "",
    "package.json": "{}",
    "apps/web/package.json": JSON.stringify({
      scripts: {
        dev: "next dev",
        check: "ultracite check",
        lint: "ultracite check",
        "lint:fix": "ultracite fix",
        "test:watch": "vitest",
        "test:unit": "vitest run",
        test: "vitest run --coverage",
        "type-check": "tsc --noEmit",
        "format:check": "prettier --check .",
        build: "next build",
        "e2e run": "playwright test",
      },
    }),
  });
  const detected = await detectChecks(sandbox, "apps/web");
  expect(summary(detected.checks)).toEqual([
    "check|lint|pnpm run check|true",
    "test:unit|test|pnpm run test:unit|false",
    "test|test|pnpm run test|true",
    "type-check|typecheck|pnpm run type-check|true",
    "format:check|format|pnpm run format:check|true",
    "build|build|pnpm run build|false",
  ]);
  expect(detected.checks.every((check) => check.cwd === "apps/web")).toBe(true);
  expect(detected.resolveScript("e2e run")?.command).toBe("pnpm run 'e2e run'");
  expect(detected.resolveScript("missing")).toBeNull();
  expect(detected.resolveScript("constructor")).toBeNull();
});

test("packageManager field wins over lockfiles", async () => {
  const sandbox = await workspace({
    "package-lock.json": "{}",
    "package.json": JSON.stringify({
      packageManager: "bun@1.3.0",
      scripts: { test: "bun test" },
    }),
  });
  expect(summary((await detectChecks(sandbox, "")).checks)).toEqual([
    "test|test|bun run test|true",
  ]);
});

test("go, cargo and python projects use their conventions", async () => {
  const go = await workspace({ "go.mod": "module x" });
  expect(summary((await detectChecks(go, "")).checks)).toEqual([
    "go-vet|lint|go vet ./...|true",
    "go-test|test|go test ./...|true",
    "go-build|build|go build ./...|false",
  ]);
  const cargo = await workspace({ "Cargo.toml": "[package]" });
  expect(
    (await detectChecks(cargo, "")).checks
      .filter((check) => check.default)
      .map((check) => check.id),
  ).toEqual(["cargo-check", "cargo-test"]);
  const python = await workspace({
    "uv.lock": "",
    "pyproject.toml": "[tool.ruff]\n[tool.mypy]\n",
    "tests/test_a.py": "",
  });
  expect(summary((await detectChecks(python, "")).checks)).toEqual([
    "ruff|lint|uv run ruff check .|true",
    "mypy|typecheck|uv run mypy .|true",
    "pytest|test|uv run pytest -q|true",
  ]);
});

test("only check-like names skip approval", () => {
  for (const name of [
    "typecheck",
    "lint",
    "test:e2e",
    "build",
    "go-test",
    "pytest",
    "format:check",
  ])
    expect(isRecognizedCheckName(name)).toBe(true);
  for (const name of [
    "deploy",
    "db:migrate",
    "test:watch",
    "lint:fix",
    "release",
  ])
    expect(isRecognizedCheckName(name)).toBe(false);
});
