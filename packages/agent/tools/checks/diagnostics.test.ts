import { describe, expect, test } from "bun:test";
import {
  compareWithBaseline,
  diagnosticFingerprint,
  parseDiagnostics,
} from "./diagnostics";

const pick = (output: string) =>
  parseDiagnostics(output).map(
    ({ file, line, column, severity, code, message, source }) => ({
      file,
      line,
      column,
      severity,
      code,
      message,
      source,
    }),
  );

describe("parseDiagnostics", () => {
  test("TypeScript in compact, pretty (ANSI) and task-runner-prefixed forms", () => {
    const output = [
      "@open-agents/agent:typecheck: tools/a.ts(390,7): error TS2769: No overload matches this call.",
      "\u001B[96msrc/b.ts\u001B[0m:\u001B[93m4\u001B[0m:\u001B[93m2\u001B[0m - \u001B[91merror\u001B[0m\u001B[90m TS2322: \u001B[0mType 'string' is not assignable to type 'number'.",
      "Found 2 errors.",
    ].join("\n");
    expect(pick(output)).toEqual([
      {
        file: "tools/a.ts",
        line: 390,
        column: 7,
        severity: "error",
        code: "TS2769",
        message: "No overload matches this call.",
        source: "typescript",
      },
      {
        file: "src/b.ts",
        line: 4,
        column: 2,
        severity: "error",
        code: "TS2322",
        message: "Type 'string' is not assignable to type 'number'.",
        source: "typescript",
      },
    ]);
  });

  test("ESLint stylish groups entries under file headers", () => {
    const output = `
/repo/src/a.ts
  3:7   error    'x' is assigned a value but never used  no-unused-vars
  9:1   warning  Unexpected console statement            no-console

✖ 2 problems (1 error, 1 warning)`;
    expect(pick(output)).toEqual([
      {
        file: "/repo/src/a.ts",
        line: 3,
        column: 7,
        severity: "error",
        code: "no-unused-vars",
        message: "'x' is assigned a value but never used",
        source: "eslint",
      },
      {
        file: "/repo/src/a.ts",
        line: 9,
        column: 1,
        severity: "warning",
        code: "no-console",
        message: "Unexpected console statement",
        source: "eslint",
      },
    ]);
  });

  test("oxlint and biome graphical reports", () => {
    const output = `
  ⚠ eslint(no-unused-vars): Variable 'a' is declared but never used.
   ╭─[src/index.ts:1:7]
 1 │ const a = 1;
   ╰────
  × eslint(no-debugger): \`debugger\` statement is not allowed
   ,-[src/b.ts:2:1]
src/c.ts:5:3 lint/style/useConst ━━━━━━━━━━━━━━━━━━━━
  × This let declares a variable that is only assigned once.`;
    expect(pick(output)).toEqual([
      {
        file: "src/index.ts",
        line: 1,
        column: 7,
        severity: "warning",
        code: "eslint(no-unused-vars)",
        message: "Variable 'a' is declared but never used.",
        source: "oxlint",
      },
      {
        file: "src/b.ts",
        line: 2,
        column: 1,
        severity: "error",
        code: "eslint(no-debugger)",
        message: "`debugger` statement is not allowed",
        source: "oxlint",
      },
      {
        file: "src/c.ts",
        line: 5,
        column: 3,
        severity: "error",
        code: "lint/style/useConst",
        message: "This let declares a variable that is only assigned once.",
        source: "biome",
      },
    ]);
  });

  test("rust, go, mypy and ruff compiler-style output", () => {
    const output = `
error[E0308]: mismatched types
 --> src/main.rs:4:18
./cmd/main.go:12:2: undefined: foo
app/models.py:3: error: Incompatible types in assignment  [assignment]
app/views.py:1:8: F401 [*] \`os\` imported but unused
app/views.py:9: note: See https://example.test`;
    expect(pick(output)).toEqual([
      {
        file: "src/main.rs",
        line: 4,
        column: 18,
        severity: "error",
        code: "E0308",
        message: "mismatched types",
        source: "rust",
      },
      {
        file: "./cmd/main.go",
        line: 12,
        column: 2,
        severity: "error",
        code: undefined,
        message: "undefined: foo",
        source: "compiler",
      },
      {
        file: "app/models.py",
        line: 3,
        column: undefined,
        severity: "error",
        code: "assignment",
        message: "Incompatible types in assignment",
        source: "compiler",
      },
      {
        file: "app/views.py",
        line: 1,
        column: 8,
        severity: "error",
        code: "F401",
        message: "`os` imported but unused",
        source: "compiler",
      },
    ]);
  });

  test("failed tests from common runners, deduplicated", () => {
    const output = `
(fail) math > adds [1.20ms]
  ● Suite › handles empty input
FAILED tests/test_api.py::test_login - AssertionError
--- FAIL: TestParse (0.00s)
test parser::tests::empty ... FAILED
not ok 3 - rejects bad input
(fail) math > adds [1.20ms]`;
    expect(
      parseDiagnostics(output).map((d) => [d.source, d.file, d.message]),
    ).toEqual([
      ["test", undefined, "math > adds"],
      ["test", undefined, "Suite › handles empty input"],
      ["test", "tests/test_api.py", "tests/test_api.py::test_login"],
      ["test", undefined, "TestParse"],
      ["test", undefined, "parser::tests::empty"],
      ["test", undefined, "rejects bad input"],
    ]);
  });

  test("oxlint ASCII reporter (as printed by ultracite in this repo)", () => {
    const output = `
  x eslint(no-empty): Unexpected empty block statements
    ,-[packages/agent/tools/checks/detect.ts:94:15]
 93 |         }
 94 |       } catch {}`;
    expect(pick(output)).toEqual([
      {
        file: "packages/agent/tools/checks/detect.ts",
        line: 94,
        column: 15,
        severity: "error",
        code: "eslint(no-empty)",
        message: "Unexpected empty block statements",
        source: "oxlint",
      },
    ]);
  });

  test("unrecognized output yields no diagnostics", () => {
    expect(
      parseDiagnostics("Segmentation fault\nError: something broke at 12:30"),
    ).toEqual([]);
  });
});

test("baseline comparison is a line-independent multiset match", () => {
  const diagnostic = {
    file: "a.ts",
    line: 1,
    severity: "error" as const,
    code: "TS1",
    message: "bad",
    source: "typescript" as const,
  };
  const baseline = [
    diagnosticFingerprint(diagnostic),
    diagnosticFingerprint({ ...diagnostic, message: "gone" }),
  ];
  const result = compareWithBaseline(
    [{ ...diagnostic, line: 40 }, diagnostic, { ...diagnostic, file: "b.ts" }],
    baseline,
  );
  expect(result).toEqual({ origins: ["existing", "new", "new"], fixed: 1 });
});
