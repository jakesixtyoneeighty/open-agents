import { tool } from "ai";
import { z } from "zod";
import { detectChecks } from "./checks/detect";
import { listChecks, runChecks } from "./checks/run";
import type { CheckDefinition } from "./checks/types";
import { toWorkspaceSearchPath } from "./workspace-search";
import { getSandbox } from "./utils";

const DEFAULT_TIMEOUT_SECONDS = 300;

/** Names that read as checks; anything else is an arbitrary script and needs approval. */
const CHECK_NAME =
  /^(type-?check|check[:-]types|tsc|types|lint|eslint|check|test|tests|spec|build|compile|ci|validate|verify|format[:-]check|fmt[:-]check|prettier[:-]check)(:[\w:-]+)?$|^(go-(vet|test|build)|cargo-(check|clippy|test|build)|ruff|mypy|pytest)$/;

export function isRecognizedCheckName(name: string) {
  return CHECK_NAME.test(name) && !/watch|fix|dev|update/i.test(name);
}

const runChecksInputSchema = z.object({
  action: z
    .enum(["run", "list"])
    .optional()
    .describe(
      "run (default) executes checks; list shows configured checks and whether their latest result is current",
    ),
  checks: z
    .array(z.string().min(1).max(200))
    .max(8)
    .optional()
    .describe(
      "Check ids from list (package.json script names such as typecheck, lint, test; or go-test, cargo-check, ruff, pytest...). Default: one typecheck, lint, format and test check",
    ),
  path: z
    .string()
    .optional()
    .describe(
      "Workspace-relative package directory (e.g., apps/web). Default: workspace root",
    ),
  timeoutSeconds: z
    .number()
    .int()
    .min(10)
    .max(600)
    .optional()
    .describe("Per-check timeout. Default: 300"),
});

export const runChecksTool = () =>
  tool({
    needsApproval: ({ checks }) =>
      (checks ?? []).some((name) => !isRecognizedCheckName(name)),
    description: `Run the project's configured checks and report structured, revision-bound results.

WHEN TO USE:
- Verifying changes: typecheck, lint, format check and tests
- Before editing, to record a baseline so later failures are classified as new or existing
- To see whether earlier results still apply (action: "list")

USAGE:
- Checks come from the project's own configuration: package.json scripts run with the project's package manager, plus go.mod, Cargo.toml and Python (ruff, mypy, pytest) conventions
- Omit checks to run the defaults; name others (e.g. "build", "test:e2e") explicitly. Use path for a package in a monorepo
- Each result has the actual exit status (passed, failed, timed_out, error), file/line diagnostics when the output format is recognized, and commandId for the complete logs (read them with command_output, never by rerunning)
- When no diagnostics are recognized, a failure keeps a bounded output preview
- Results are bound to revision, a hash of the working tree. Any later file change makes them stale: action "list" shows current: false
- With an earlier run recorded, diagnostics carry origin "new" or "existing" and verdict says whether the failure is new, pre-existing or fixed. changedFile marks diagnostics in files that differ from HEAD

IMPORTANT:
- Report a check as passing only from a passed result whose revision is still current; rerun after edits
- Use this instead of running check scripts through bash
- Checks run one at a time; long jobs may hit the timeout, which is reported as timed_out, not as a code failure`,
    inputSchema: runChecksInputSchema,
    execute: async (input, { experimental_context, abortSignal }) => {
      try {
        const sandbox = await getSandbox(experimental_context, "run_checks");
        const cwd = toWorkspaceSearchPath(input.path, sandbox.workingDirectory);
        if (cwd === null) {
          return {
            success: false as const,
            error: "Path must stay within the workspace.",
          };
        }
        const detected = await detectChecks(sandbox, cwd);
        let selected: CheckDefinition[];
        if (input.checks?.length) {
          selected = [];
          const unknown: string[] = [];
          for (const name of new Set(input.checks)) {
            const check =
              detected.checks.find((candidate) => candidate.id === name) ??
              detected.resolveScript(name);
            if (check) selected.push(check);
            else unknown.push(name);
          }
          if (unknown.length) {
            return {
              success: false as const,
              error: `Unknown check${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Available: ${detected.checks.map((check) => check.id).join(", ") || "none"}.`,
            };
          }
        } else {
          selected = detected.checks.filter((check) =>
            input.action === "list" ? true : check.default,
          );
        }
        if (input.action === "list") {
          return await listChecks({
            sandbox,
            checks: selected,
            signal: abortSignal,
          });
        }
        if (selected.length === 0) {
          return {
            success: false as const,
            error: `No configured checks found in ${cwd || "the workspace root"}. Pass path for a package directory, or verify with bash and say which commands you ran.`,
          };
        }
        return await runChecks({
          sandbox,
          checks: selected,
          timeoutMs: (input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
          signal: abortSignal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false as const,
          error: `Checks failed to run: ${message}`,
        };
      }
    },
  });
