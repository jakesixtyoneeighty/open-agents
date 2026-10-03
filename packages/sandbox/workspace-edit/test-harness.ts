import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { WORKSPACE_EDIT_WORKER } from "./worker-source";
import type { WorkspaceEditRequest, WorkspaceEditResult } from "./types";

const exec = promisify(execFile);

/** Executes the shipped worker on real files with an OS lock, without a cloud sandbox. */
export function createLocalWorkspaceEditor(
  root: string,
  store = `${root}-edits`,
) {
  return async (
    request: WorkspaceEditRequest,
    faultSetup = "",
  ): Promise<WorkspaceEditResult> => {
    await mkdir(store, { recursive: true });
    const input = path.join(store, `request-${randomUUID()}.json`);
    const output = `${input}.result`;
    await writeFile(input, JSON.stringify(request));
    const args = [
      "node",
      "-e",
      faultSetup + WORKSPACE_EDIT_WORKER,
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
        path.join(store, "workspace.lock"),
        ...args,
      ]);
    } else {
      await exec("flock", [
        "-w",
        "30",
        path.join(store, "workspace.lock"),
        ...args,
      ]);
    }
    return JSON.parse(await readFile(output, "utf8")) as WorkspaceEditResult;
  };
}
