import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { WORKSPACE_SEARCH_WORKER } from "./worker-source";
import type { WorkspaceSearchRequest, WorkspaceSearchResult } from "./types";

const exec = promisify(execFile);

/** Executes the shipped worker on real files with an OS lock, without a cloud sandbox. */
export function createLocalWorkspaceSearcher(
  root: string,
  store = `${root}-search`,
) {
  return async (
    request: WorkspaceSearchRequest,
  ): Promise<WorkspaceSearchResult> => {
    await mkdir(store, { recursive: true });
    const input = path.join(store, `request-${randomUUID()}.json`);
    const output = `${input}.result`;
    await writeFile(input, JSON.stringify(request));
    const lock = path.join(store, `${request.id}.lock`);
    const args = [
      "node",
      "-e",
      WORKSPACE_SEARCH_WORKER,
      root,
      store,
      input,
      output,
    ];
    if (process.platform === "darwin") {
      // macOS lacks the flock CLI; fcntl holds the same advisory OS lock across exec.
      await exec("python3", [
        "-c",
        "import fcntl,os,sys; f=open(sys.argv[1],'a'); fcntl.flock(f,fcntl.LOCK_EX); os.set_inheritable(f.fileno(),True); os.execvp(sys.argv[2],sys.argv[2:])",
        lock,
        ...args,
      ]);
    } else {
      await exec("flock", ["-w", "30", lock, ...args]);
    }
    return JSON.parse(await readFile(output, "utf8")) as WorkspaceSearchResult;
  };
}
