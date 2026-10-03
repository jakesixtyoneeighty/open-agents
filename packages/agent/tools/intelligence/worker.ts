import { WORKSPACE_REVISION_SOURCE } from "@open-agents/sandbox/workspace-revision-source";

/** Isolated language-service server. Never loads workspace plugins or executes project code. */
export const INTELLIGENCE_WORKER =
  String.raw`
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const [rootInput, runtime, requestPath, outputPath] = process.argv.slice(2);
const root = fs.realpathSync(rootInput);
const request = JSON.parse(fs.readFileSync(requestPath, "utf8"));
const hash = text => createHash("sha256").update(text).digest("hex");
const fail = message => { throw new Error(message); };
` +
  WORKSPACE_REVISION_SOURCE +
  String.raw`
const engine = "TypeScript 5.9.3 language service";
let revision = null;
function inside(file, base) { return file === base || file.startsWith(base + path.sep); }
function safe(file, dependencies = true) {
  file = path.resolve(file);
  if (!inside(file, root) && !inside(file, runtime)) return false;
  const relative = path.relative(inside(file, root) ? root : runtime, file);
  if (relative.split(path.sep).some(part => part.toLowerCase() === ".git" || part.toLowerCase().startsWith(".env") || (!dependencies && part === "node_modules"))) return false;
  try {
    const real = fs.realpathSync(file);
    if (!inside(real, root) && !inside(real, runtime)) return false;
    if (!dependencies && (real !== file || (fs.statSync(file).isFile() && fs.statSync(file).nlink > 1))) return false;
    return true;
  } catch { return false; }
}
function run() {
  const input = request.input;
  if (!/\.(?:[cm]?[jt]sx?)$/i.test(input.filePath)) return { success: false, availability: "unsupported", error: "Only TypeScript and JavaScript sources are supported.", engine, revision };
  if (path.isAbsolute(input.filePath) || input.filePath.includes("\\") || input.filePath.split("/").some(part => !part || part === "." || part === "..")) fail("Use a workspace-relative source path.");
  const file = path.join(root, input.filePath);
  if (!safe(file, false)) fail("Source is unavailable, sensitive, linked, or outside the workspace.");
  revision = workspaceRevision(root);
  if (input.expectedRevision && revision !== input.expectedRevision) return { success: false, availability: "stale", error: "Workspace changed. Inspect again before renaming.", engine, revision };
  const ts = require(path.join(runtime, "node_modules/typescript/lib/typescript.js"));
  const snapshots = new Map();
  let bytesRead = 0;
  function read(file) {
    file = path.resolve(file);
    if (snapshots.has(file)) return snapshots.get(file);
    if (!safe(file)) return undefined;
    const stat = fs.statSync(file);
    if (!stat.isFile()) return undefined;
    if (stat.size > 4 * 1024 * 1024) fail("Language input exceeds the 4 MiB file limit.");
    const bytes = fs.readFileSync(file);
    const text = bytes.toString("utf8");
    if (bytes.includes(0) || !Buffer.from(text).equals(bytes)) fail("Language input is not UTF-8 text.");
    bytesRead += bytes.length;
    if (bytesRead > 32 * 1024 * 1024 || snapshots.size >= 4000) fail("Language project exceeds the analysis budget; narrow the project.");
    snapshots.set(file, text);
    return text;
  }
  const host = {
    useCaseSensitiveFileNames: true,
    readFile: read,
    fileExists: file => safe(file) && fs.statSync(file).isFile(),
    directoryExists: file => safe(file) && fs.statSync(file).isDirectory(),
    realpath: file => safe(file) ? fs.realpathSync(file) : file,
    getDirectories: dir => safe(dir) ? ts.sys.getDirectories(dir).filter(item => safe(path.join(dir, item))) : [],
    readDirectory: (dir, extensions, excludes, includes, depth) => {
      if (!safe(dir)) return [];
      // Reject symlink directories before TS can traverse them.
      return ts.matchFiles(dir, extensions, excludes, includes, true, root, depth,
        directory => {
          if (!safe(directory) || fs.realpathSync(directory) !== path.resolve(directory)) return { files: [], directories: [] };
          const entries = fs.readdirSync(directory, { withFileTypes: true });
          return { files: entries.filter(e => e.isFile() && safe(path.join(directory, e.name))).map(e => e.name), directories: entries.filter(e => e.isDirectory() && safe(path.join(directory, e.name))).map(e => e.name) };
        }, file => file).filter(file => safe(file));
    },
  };
  let config;
  for (let dir = path.dirname(file); inside(dir, root); dir = path.dirname(dir)) {
    config = ["tsconfig.json", "jsconfig.json"].map(name => path.join(dir, name)).find(name => host.fileExists(name));
    if (config || dir === root) break;
  }
  if (!config) fail("No tsconfig.json or jsconfig.json found. Configure a project before semantic analysis.");
  const json = ts.readConfigFile(config, read);
  if (json.error) fail("Project configuration could not be read.");
  const parsed = ts.parseJsonConfigFileContent(json.config, host, path.dirname(config), { noEmit: true }, config);
  if (parsed.errors.length) fail("Project configuration has errors; fix it before semantic analysis.");
  const files = parsed.fileNames.filter(name => safe(name, false));
  if (!files.includes(file)) fail("Source is excluded from this configured project.");
  if (files.length > 2000) fail("Project exceeds 2,000 source files.");
  const service = ts.createLanguageService({
    ...host,
    useCaseSensitiveFileNames: () => true,
    getCompilationSettings: () => parsed.options,
    getScriptFileNames: () => files,
    getScriptVersion: () => "0",
    getScriptSnapshot: file => { const text = read(file); return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text); },
    getCurrentDirectory: () => path.dirname(config),
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
  });
  try {
    const program = service.getProgram();
    const source = program.getSourceFile(file);
    if (!source) fail("Source is unavailable to the language service.");
    const starts = source.getLineStarts();
    const start = starts[input.line - 1];
    const end = starts[input.line] ?? source.text.length;
    if (start === undefined || input.column < 1 || start + input.column - 1 > end || (input.line < starts.length && start + input.column - 1 >= end)) fail("Position is outside the source file.");
    const position = start + input.column - 1;
    const locations = [];
    let omitted = 0;
    function location(fileName, span, extra = {}) {
      if (!safe(fileName, false)) { omitted++; return; }
      const source = program.getSourceFile(fileName);
      if (!source) { omitted++; return; }
      const a = source.getLineAndCharacterOfPosition(span.start);
      const b = source.getLineAndCharacterOfPosition(span.start + span.length);
      locations.push({ path: path.relative(root, fileName), line: a.line + 1, column: a.character + 1, endLine: b.line + 1, endColumn: b.character + 1, ...extra });
    }
    let operations;
    if (request.rename) {
      if (parsed.projectReferences?.length) fail("Rename across project references is unsupported; no files changed.");
      const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, input.newName);
      if (scanner.scan() !== ts.SyntaxKind.Identifier || scanner.getTokenText() !== input.newName || scanner.scan() !== ts.SyntaxKind.EndOfFileToken) fail("The new name must be a non-keyword identifier.");
      const info = service.getRenameInfo(file, position, { allowRenameOfImportPath: false });
      if (!info.canRename || info.fileToRename) fail("This symbol cannot be renamed safely.");
      const spans = service.findRenameLocations(file, position, false, false, true);
      if (!spans?.length) fail("No semantic rename locations found.");
      const grouped = new Map();
      for (const span of spans) {
        if (!safe(span.fileName, false)) fail("Rename includes a dependency or inaccessible file; no files changed.");
        const group = grouped.get(span.fileName) ?? [];
        group.push(span); grouped.set(span.fileName, group);
      }
      if (grouped.size > 25) fail("Rename exceeds 25 files; partial semantic renames are refused.");
      operations = [];
      for (const [fileName, edits] of grouped) {
        const before = read(fileName);
        let content = before;
        let boundary = content.length;
        for (const edit of edits.sort((a, b) => b.textSpan.start - a.textSpan.start)) {
          const { start, length } = edit.textSpan;
          if (start + length > boundary) fail("Overlapping rename locations.");
          content = content.slice(0, start) + (edit.prefixText ?? "") + input.newName + (edit.suffixText ?? "") + content.slice(start + length);
          boundary = start;
        }
        if (content !== before) operations.push({ kind: "write", path: path.relative(root, fileName), expectedRevision: hash(before), content });
      }
      if (!operations.length) fail("Rename would not change any files.");
    } else if (input.action === "symbols") {
      function visit(node) {
        if (node.kind !== "module") for (const span of node.spans) location(file, span, { name: node.text.slice(0, 200), kind: node.kind });
        for (const child of node.childItems ?? []) visit(child);
      }
      visit(service.getNavigationTree(file));
    } else if (input.action === "definitions") {
      for (const item of service.getDefinitionAtPosition(file, position) ?? []) location(item.fileName, item.textSpan, { name: item.name.slice(0, 200), kind: item.kind });
    } else {
      for (const item of service.getReferencesAtPosition(file, position) ?? []) location(item.fileName, item.textSpan);
    }
    // Changes in dependencies also invalidate the observation, even when gitignored.
    for (const [name, text] of snapshots) if (!safe(name) || fs.readFileSync(name, "utf8") !== text) fail("A language input changed during analysis; retry.");
    if (workspaceRevision(root) !== revision) return { success: false, availability: "stale", revision, engine, error: "Workspace changed during analysis; retry." };
    return { success: true, availability: "available", revision, engine,
      project: path.relative(root, config), scope: "Configured project only; dependencies and external files are omitted. Cross-project consumers are not covered.",
      ...(operations ? { operations, readRevisions: Object.fromEntries([...snapshots].filter(([name]) => inside(name, root) && safe(name, false)).map(([name, text]) => [path.relative(root, name), hash(text)])) } : { locations: locations.slice(0, input.limit), truncated: locations.length > input.limit, omitted: omitted + Math.max(0, locations.length - input.limit) }),
    };
  } finally { service.dispose(); }
}
try { fs.writeFileSync(outputPath, JSON.stringify(run())); }
catch (error) { fs.writeFileSync(outputPath, JSON.stringify({ success: false, availability: "unavailable", revision, engine, error: error.message?.startsWith("Command failed") ? "Cannot bind language results to a git working-tree revision." : error.message })); }
`;
