import * as path from "path";
import type { Sandbox } from "@open-agents/sandbox";
import { shellEscape } from "../utils";
import type { CheckDefinition, CheckKind } from "./types";

type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

const NOT_A_CHECK = /watch|fix|dev|update|serve|start|debug|snapshot/i;

/** Ordered: an exact canonical name wins the default slot for its kind. */
const SCRIPT_KINDS: {
  kind: CheckKind;
  canonical: string[];
  pattern: RegExp;
}[] = [
  {
    kind: "typecheck",
    canonical: ["typecheck", "type-check", "check-types", "tsc"],
    pattern: /^(type-?check|check[:-]types|tsc|types)(:.+)?$/,
  },
  {
    kind: "format",
    canonical: ["format:check", "fmt:check", "prettier:check"],
    pattern: /^(format|fmt|prettier)[:-]check$/,
  },
  {
    kind: "lint",
    canonical: ["lint", "check"],
    pattern: /^(lint|eslint|check)(:.+)?$/,
  },
  { kind: "test", canonical: ["test"], pattern: /^(test|tests|spec)(:.+)?$/ },
  { kind: "build", canonical: ["build"], pattern: /^(build|compile)$/ },
  { kind: "ci", canonical: ["ci"], pattern: /^(ci|validate|verify)$/ },
];

const DEFAULT_KINDS = new Set<CheckKind>([
  "typecheck",
  "lint",
  "format",
  "test",
]);

async function readText(sandbox: Sandbox, file: string) {
  try {
    return await sandbox.readFile(file, "utf-8");
  } catch {
    return null;
  }
}

async function exists(sandbox: Sandbox, file: string) {
  try {
    await sandbox.access(file);
    return true;
  } catch {
    return false;
  }
}

/** Directories from the package up to the workspace root, nearest first. */
function ancestors(packageDir: string, root: string) {
  const dirs: string[] = [];
  let current = packageDir;
  for (;;) {
    dirs.push(current);
    if (current === root || !current.startsWith(root)) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

async function detectPackageManager(
  sandbox: Sandbox,
  packageDir: string,
): Promise<PackageManager> {
  for (const dir of ancestors(packageDir, sandbox.workingDirectory)) {
    const manifest = await readText(sandbox, path.join(dir, "package.json"));
    if (manifest) {
      try {
        const field = (JSON.parse(manifest) as { packageManager?: unknown })
          .packageManager;
        if (typeof field === "string") {
          const name = field.split("@")[0];
          if (
            name === "pnpm" ||
            name === "yarn" ||
            name === "bun" ||
            name === "npm"
          )
            return name;
        }
      } catch {
        // Unparseable manifest: fall back to lockfiles.
      }
    }
    const lockfiles: [string, PackageManager][] = [
      ["pnpm-lock.yaml", "pnpm"],
      ["yarn.lock", "yarn"],
      ["bun.lock", "bun"],
      ["bun.lockb", "bun"],
      ["package-lock.json", "npm"],
    ];
    for (const [lockfile, manager] of lockfiles) {
      if (await exists(sandbox, path.join(dir, lockfile))) return manager;
    }
  }
  return "npm";
}

function scriptKind(name: string): CheckKind | null {
  if (NOT_A_CHECK.test(name)) return null;
  return SCRIPT_KINDS.find((entry) => entry.pattern.test(name))?.kind ?? null;
}

async function packageJsonChecks(
  sandbox: Sandbox,
  packageDir: string,
  cwd: string,
): Promise<{
  checks: CheckDefinition[];
  scripts: Record<string, string>;
  manager: PackageManager;
} | null> {
  const manifest = await readText(
    sandbox,
    path.join(packageDir, "package.json"),
  );
  if (!manifest) return null;
  let scripts: Record<string, string> = {};
  try {
    const parsed = JSON.parse(manifest) as { scripts?: unknown };
    if (parsed.scripts && typeof parsed.scripts === "object") {
      scripts = Object.fromEntries(
        Object.entries(parsed.scripts).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
    }
  } catch {
    return null;
  }
  const manager = await detectPackageManager(sandbox, packageDir);
  const seenBodies = new Set<string>();
  const checks: CheckDefinition[] = [];
  for (const [name, body] of Object.entries(scripts)) {
    const kind = scriptKind(name);
    if (!kind) continue;
    // Aliases (e.g. lint and check both running the same command) run once.
    if (seenBodies.has(body.trim())) continue;
    seenBodies.add(body.trim());
    checks.push({
      id: name,
      kind,
      command: packageScriptCommand(manager, name),
      cwd,
      source: "package.json",
      default: false,
    });
  }
  for (const { kind, canonical } of SCRIPT_KINDS) {
    if (!DEFAULT_KINDS.has(kind)) continue;
    const ofKind = checks.filter((check) => check.kind === kind);
    const chosen =
      canonical
        .map((name) => ofKind.find((check) => check.id === name))
        .find(Boolean) ?? ofKind[0];
    if (chosen) chosen.default = true;
  }
  return { checks, scripts, manager };
}

export function packageScriptCommand(manager: PackageManager, script: string) {
  const name = /^[\w:.@/-]+$/.test(script) ? script : shellEscape(script);
  return `${manager} run ${name}`;
}

async function goChecks(sandbox: Sandbox, packageDir: string, cwd: string) {
  if (!(await exists(sandbox, path.join(packageDir, "go.mod")))) return [];
  const check = (
    id: string,
    kind: CheckKind,
    command: string,
    isDefault: boolean,
  ) =>
    ({ id, kind, command, cwd, source: "go.mod", default: isDefault }) as const;
  return [
    check("go-vet", "lint", "go vet ./...", true),
    check("go-test", "test", "go test ./...", true),
    check("go-build", "build", "go build ./...", false),
  ];
}

async function cargoChecks(sandbox: Sandbox, packageDir: string, cwd: string) {
  if (!(await exists(sandbox, path.join(packageDir, "Cargo.toml")))) return [];
  const check = (
    id: string,
    kind: CheckKind,
    command: string,
    isDefault: boolean,
  ) =>
    ({
      id,
      kind,
      command,
      cwd,
      source: "Cargo.toml",
      default: isDefault,
    }) as const;
  return [
    check("cargo-check", "typecheck", "cargo check --all-targets", true),
    check("cargo-clippy", "lint", "cargo clippy --all-targets", false),
    check("cargo-test", "test", "cargo test", true),
    check("cargo-build", "build", "cargo build", false),
  ];
}

async function pythonChecks(sandbox: Sandbox, packageDir: string, cwd: string) {
  const pyproject =
    (await readText(sandbox, path.join(packageDir, "pyproject.toml"))) ?? "";
  const has = (file: string) => exists(sandbox, path.join(packageDir, file));
  if (!pyproject && !(await has("setup.cfg")) && !(await has("pytest.ini")))
    return [];
  const runner = (await has("uv.lock"))
    ? "uv run "
    : (await has("poetry.lock"))
      ? "poetry run "
      : "";
  const checks: CheckDefinition[] = [];
  const add = (id: string, kind: CheckKind, command: string) =>
    checks.push({
      id,
      kind,
      command: runner + command,
      cwd,
      source: "python",
      default: true,
    });
  if (
    pyproject.includes("[tool.ruff") ||
    (await has("ruff.toml")) ||
    (await has(".ruff.toml"))
  )
    add("ruff", "lint", "ruff check .");
  if (pyproject.includes("[tool.mypy") || (await has("mypy.ini")))
    add("mypy", "typecheck", "mypy .");
  if (
    pyproject.includes("[tool.pytest") ||
    (await has("pytest.ini")) ||
    (await has("conftest.py")) ||
    (await has("tests"))
  )
    add("pytest", "test", "pytest -q");
  return checks;
}

/**
 * Checks configured by the project in `cwd`: package.json scripts (run with
 * the project's package manager) plus Go, Cargo and Python conventions.
 */
export async function detectChecks(sandbox: Sandbox, cwd: string) {
  const packageDir = path.join(sandbox.workingDirectory, cwd);
  const node = await packageJsonChecks(sandbox, packageDir, cwd);
  const checks = [
    ...(node?.checks ?? []),
    ...(await goChecks(sandbox, packageDir, cwd)),
    ...(await cargoChecks(sandbox, packageDir, cwd)),
    ...(await pythonChecks(sandbox, packageDir, cwd)),
  ];
  return {
    checks,
    /** Resolves any other configured package.json script by name. */
    resolveScript(name: string): CheckDefinition | null {
      if (!node || !Object.hasOwn(node.scripts, name)) return null;
      return {
        id: name,
        kind: scriptKind(name) ?? "script",
        command: packageScriptCommand(node.manager, name),
        cwd,
        source: "package.json",
        default: false,
      };
    },
  };
}
