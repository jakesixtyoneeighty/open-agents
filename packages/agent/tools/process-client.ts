/** Bootstrap is called under an OS lock. Requests run after releasing the lock,
 * allowing stop/status to proceed while another caller waits. */
export const PROCESS_CLIENT = String.raw`
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
const [store, worker, runner, requestPath, outputPath] = process.argv.slice(2);
const socketPath = path.join(store, "process.sock");
const bootstrap = !requestPath;
function call() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    socket.setEncoding("utf8");
    let data = "";
    socket.setTimeout(35000, () => socket.destroy(new Error("Process request timed out; execution may continue. Recover status with the same process ID before starting another job.")));
    socket.on("connect", () => socket.write((bootstrap ? JSON.stringify({ input: { action: "list" } }) : fs.readFileSync(requestPath, "utf8")) + "\n"));
    socket.on("data", chunk => { data += chunk; if (data.length > 4000000) socket.destroy(new Error("Process result exceeded limit.")); });
    socket.on("error", reject);
    socket.on("end", () => data.trim() ? resolve(data) : reject(new Error("Process controller disconnected; outcome unknown.")));
  });
}
try {
  let result;
  try { result = await call(); }
  catch (error) {
    if (!bootstrap || !["ENOENT", "ECONNREFUSED"].includes(error.code)) throw error;
    fs.rmSync(socketPath, { force: true });
    const child = spawn(process.execPath, [worker, store, runner], { detached: true, stdio: "ignore" });
    child.unref();
    for (let i = 0; i < 50; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      try { result = await call(); break; }
      catch (e) { if (!["ENOENT", "ECONNREFUSED"].includes(e.code)) throw e; }
    }
    if (!result) throw new Error("Process controller could not start.");
  }
  if (outputPath) fs.writeFileSync(outputPath, result, { mode: 384 });
} catch (error) {
  if (outputPath) fs.writeFileSync(outputPath, JSON.stringify({ success: false, error: error.message }), { mode: 384 });
  else { process.stderr.write(error.message); process.exitCode = 1; }
}
`;
