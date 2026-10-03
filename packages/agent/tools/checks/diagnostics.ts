import type { CheckDiagnostic } from "./types";

export const MAX_DIAGNOSTICS = 500;

// Built from char codes: ESC and BEL are control characters by design here.
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI = new RegExp(
  `${ESC}\\[[0-9;?]*[ -/]*[@-~]|${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)`,
  "g",
);
/** Task-runner prefixes such as "@scope/pkg:typecheck: " (turbo, lerna, nx). */
const RUNNER_PREFIX = /^[@\w./-]+:[a-z][\w-]*(?::[\w-]+)*:\s/i;

const TS_PAREN = /([^\s(]+)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)$/;
const TS_PRETTY = /([^\s:]+):(\d+):(\d+) - (error|warning) (TS\d+): (.+)$/;
const ESLINT_FILE = /^(\/\S+|[\w.@-][^\s:]*\.[a-z]{1,6})$/i;
const ESLINT_ENTRY =
  /^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)(?:\s{2,}([@\w/-]+))?\s*$/;
const GRAPHICAL_HEADER =
  /^\s*(?:([×✗⚠!])|(x)(?=\s+[\w@/-]+\([\w@/-]+\):))\s+(?:([\w@/-]+\([\w@/-]+\)):\s*)?(.+)$/;
const GRAPHICAL_LOCATION = /[╭,][─-]\[(.+?):(\d+):(\d+)\]/;
const BIOME_HEADER =
  /^(\S+):(\d+):(\d+) ((?:lint|assist)\/[\w/]+|format|parse|organizeImports)\b/;
const RUST_HEADER = /^(error|warning)(?:\[([\w:]+)\])?: (.+)$/;
const RUST_LOCATION = /^\s*--> (.+?):(\d+):(\d+)$/;
const GENERIC =
  /^(\.{0,2}\/?[\w@.-][^\s:]*\.[a-z]{1,8}):(\d+)(?::(\d+))?:\s+(?:(error|warning|note|info)(?:\[([^\]]+)\])?:\s*)?(.+)$/i;
const RUFF_CODE = /^([A-Z]{1,4}\d{2,4})(?:\s+\[\*\])?\s+(.+)$/;
const TRAILING_CODE = /\s{1,2}\[([\w-]+)\]$/;
const TESTS: {
  pattern: RegExp;
  file?: (match: RegExpExecArray) => string | undefined;
}[] = [
  { pattern: /^\(fail\) (.+?)(?: \[\d[\d.]*m?s\])?$/ }, // bun
  { pattern: /^\s*● (?!Console)(.+)$/ }, // jest
  { pattern: /^\s*FAIL\s+(\S.*?)\s*$/ }, // jest/vitest file or vitest test
  {
    pattern: /^FAILED (\S+?)(?: - .*)?$/,
    file: (match) => match[1]?.split("::")[0],
  }, // pytest
  { pattern: /^\s*--- FAIL: (\S+)/ }, // go test
  { pattern: /^test (\S+) \.\.\. FAILED$/ }, // cargo test
  { pattern: /^not ok \d+ - (.+)$/ }, // node:test / TAP
];

const severityOf = (value: string | undefined): "error" | "warning" =>
  value && /warn/i.test(value) ? "warning" : "error";

/**
 * Best-effort file/line diagnostics from common tool formats. Output that
 * matches none of them yields nothing; callers keep the raw log.
 */
export function parseDiagnostics(output: string): CheckDiagnostic[] {
  const diagnostics: CheckDiagnostic[] = [];
  const seen = new Set<string>();
  const push = (diagnostic: CheckDiagnostic) => {
    if (diagnostics.length >= MAX_DIAGNOSTICS) return;
    const key = JSON.stringify(diagnostic);
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push(diagnostic);
  };
  let eslintFile: string | undefined;
  let graphical:
    | { severity: "error" | "warning"; code?: string; message: string }
    | undefined;
  let biome:
    | { file: string; line: number; column: number; code: string }
    | undefined;
  let rust:
    | { severity: "error" | "warning"; code?: string; message: string }
    | undefined;

  for (const rawLine of output.replace(ANSI, "").split(/\r?\n/)) {
    const line = rawLine.replace(RUNNER_PREFIX, "").replace(/\s+$/, "");
    if (!line.trim()) {
      eslintFile = undefined;
      continue;
    }
    let match: RegExpExecArray | null;
    if ((match = TS_PAREN.exec(line) ?? TS_PRETTY.exec(line))) {
      push({
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
        severity: severityOf(match[4]),
        code: match[5],
        message: match[6]?.trim() ?? "",
        source: "typescript",
      });
      continue;
    }
    if (eslintFile && (match = ESLINT_ENTRY.exec(line))) {
      push({
        file: eslintFile,
        line: Number(match[1]),
        column: Number(match[2]),
        severity: severityOf(match[3]),
        ...(match[5] ? { code: match[5] } : {}),
        message: match[4]?.trim() ?? "",
        source: "eslint",
      });
      continue;
    }
    if ((match = BIOME_HEADER.exec(line))) {
      biome = {
        file: match[1] ?? "",
        line: Number(match[2]),
        column: Number(match[3]),
        code: match[4] ?? "",
      };
      continue;
    }
    if ((match = GRAPHICAL_HEADER.exec(line))) {
      const severity =
        match[1] === "⚠" || match[1] === "!" ? "warning" : "error";
      const message = match[4]?.trim() ?? "";
      if (biome) {
        push({ ...biome, severity, message, source: "biome" });
        biome = undefined;
      } else {
        graphical = {
          severity,
          ...(match[3] ? { code: match[3] } : {}),
          message,
        };
      }
      continue;
    }
    if (graphical && (match = GRAPHICAL_LOCATION.exec(line))) {
      push({
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
        ...graphical,
        source: "oxlint",
      });
      graphical = undefined;
      continue;
    }
    if ((match = RUST_HEADER.exec(line))) {
      rust = {
        severity: severityOf(match[1]),
        ...(match[2] ? { code: match[2] } : {}),
        message: match[3]?.trim() ?? "",
      };
      continue;
    }
    if (rust && (match = RUST_LOCATION.exec(line))) {
      push({
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
        ...rust,
        source: "rust",
      });
      rust = undefined;
      continue;
    }
    if ((match = GENERIC.exec(line))) {
      let message = match[6]?.trim() ?? "";
      let code = match[5];
      const ruff = code ? null : RUFF_CODE.exec(message);
      if (ruff) {
        code = ruff[1];
        message = ruff[2] ?? message;
      }
      const trailing = code ? null : TRAILING_CODE.exec(message);
      if (trailing) {
        code = trailing[1];
        message = message.slice(0, trailing.index).trim();
      }
      if (match[4] && /note|info/i.test(match[4])) continue;
      push({
        file: match[1],
        line: Number(match[2]),
        ...(match[3] ? { column: Number(match[3]) } : {}),
        severity: severityOf(match[4]),
        ...(code ? { code } : {}),
        message,
        source: "compiler",
      });
      continue;
    }
    if (ESLINT_FILE.test(line)) {
      eslintFile = line;
      continue;
    }
    for (const test of TESTS) {
      const testMatch = test.pattern.exec(line);
      if (!testMatch?.[1]) continue;
      const file = test.file?.(testMatch);
      push({
        ...(file ? { file } : {}),
        severity: "error",
        message: testMatch[1].trim(),
        source: "test",
      });
      break;
    }
  }
  return diagnostics;
}

/** Line-independent identity so moved code still matches its baseline. */
export function diagnosticFingerprint(diagnostic: CheckDiagnostic) {
  return [
    diagnostic.source,
    diagnostic.file ?? "",
    diagnostic.code ?? "",
    diagnostic.message.replace(/\s+/g, " ").trim(),
  ].join("\u0000");
}

/**
 * Multiset comparison against a baseline: a diagnostic is existing when the
 * baseline had an unmatched diagnostic with the same fingerprint.
 */
export function compareWithBaseline(
  diagnostics: CheckDiagnostic[],
  baseline: string[],
) {
  const remaining = new Map<string, number>();
  for (const fingerprint of baseline) {
    remaining.set(fingerprint, (remaining.get(fingerprint) ?? 0) + 1);
  }
  const origins = diagnostics.map((diagnostic) => {
    const fingerprint = diagnosticFingerprint(diagnostic);
    const count = remaining.get(fingerprint) ?? 0;
    if (count > 0) {
      remaining.set(fingerprint, count - 1);
      return "existing" as const;
    }
    return "new" as const;
  });
  let fixed = 0;
  for (const count of remaining.values()) fixed += count;
  return { origins, fixed };
}
