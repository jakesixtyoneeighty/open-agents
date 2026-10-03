/** Each runner owns its own process group. Only it signals that group: no
 * caller-provided PID, stale PID lookup, pkill, or shared port-based killing. */
export const PROCESS_RUNNER = String.raw`
import { spawn } from "node:child_process";
let child;
let finishing = false;
let reason;
process.on("SIGTERM", () => {});
function terminate() {
  try { process.kill(-process.pid, "SIGTERM"); } catch {}
  setTimeout(() => { process.kill(-process.pid, "SIGKILL"); }, 500);
}
function finish(code, signal, error) {
  if (finishing) return;
  finishing = true;
  clearTimeout(timer);
  if (process.connected) process.send({ kind: "result", state: reason ?? (error ? "error" : "exited"), exitCode: reason ? null : code, signal, error });
  // Also clean children that outlive their foreground shell. The runner remains
  // the live group leader until it kills its own group, avoiding PID reuse.
  terminate();
}
function stop(value) {
  if (finishing) return;
  reason = value;
  finish(null, null);
}
const input = JSON.parse(process.argv[2]);
const timer = setTimeout(() => stop("timed_out"), Math.max(1, input.deadlineAt - Date.now()));
process.on("message", message => { if (message === "stop") stop("stopped"); });
process.on("disconnect", () => stop("expired"));
try {
  child = spawn("bash", ["-c", input.command], { cwd: input.cwd, stdio: ["ignore", "inherit", "inherit"] });
  child.on("error", error => finish(null, null, error.message));
  child.on("exit", (code, signal) => finish(code, signal));
  child.on("spawn", () => { if (process.connected) process.send({ kind: "started" }); });
} catch (error) { finish(null, null, error.message); }
`;
