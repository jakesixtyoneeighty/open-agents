/** Shared by language intelligence and the locked edit worker. No user index changes. */
export const WORKSPACE_REVISION_SOURCE = String.raw`
function workspaceRevision(directory) {
  const { execFileSync } = require("node:child_process");
  const syncFs = require("node:fs");
  const os = require("node:os");
  const git = (args, env, input) => { const output = execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", ...args], {
    cwd: directory, encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024,
    input, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ...env },
  }); return args.includes("-z") ? output : output.trim(); };
  const temporary = syncFs.mkdtempSync(path.join(os.tmpdir(), "oa-revision-"));
  try {
    let filters = "";
    try { filters = git(["config", "--name-only", "--get-regexp", "^filter\\..*\\.(clean|process)$"]); }
    catch (error) { if (error.status !== 1) throw error; }
    const top = git(["rev-parse", "--show-toplevel"]);
    if (filters) {
      const names = git(["-C", top, "ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
      const attributes = names ? git(["-C", top, "check-attr", "--stdin", "-z", "filter"], undefined, names).split("\0") : [];
      for (let i = 2; i < attributes.length; i += 3) {
        if (!["unspecified", "unset", "set"].includes(attributes[i])) throw new Error("Semantic revision is unavailable while Git clean/process filters apply to workspace files; no project filters were executed.");
      }
    }
    const index = path.join(temporary, "index");
    const source = path.resolve(directory, git(["rev-parse", "--git-path", "index"]));
    if (syncFs.existsSync(source)) syncFs.copyFileSync(source, index);
    const env = { GIT_INDEX_FILE: index };
    git(["-C", top, "-c", "core.fsmonitor=false", "add", "-A", "--", "."], env);
    return git(["write-tree"], env);
  } finally { syncFs.rmSync(temporary, { recursive: true, force: true }); }
}
`;
