/** Sandbox resident controller: host steps reconnect to its socket. Process
 * records/logs survive controller loss, but live jobs are never resurrected. */
export const PROCESS_WORKER = String.raw`
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
const [store, runner] = process.argv.slice(2);
const records = new Map();
const live = new Map();
const RETENTION = 6 * 60 * 60 * 1000;
const LOG_LIMIT = 1024 * 1024;
const active = r => r.state === "starting" || r.state === "running";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let lastActivity = Date.now();
function save(r) {
  const file = path.join(store, r.processId + ".json");
  fs.writeFileSync(file + ".tmp", JSON.stringify(r), { mode: 384 });
  fs.renameSync(file + ".tmp", file);
}
for (const name of fs.readdirSync(store)) {
  if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
  const r = JSON.parse(fs.readFileSync(path.join(store, name), "utf8"));
  if (active(r)) { r.state = "expired"; r.endedAt = Date.now(); r.error = "Process controller restarted or sandbox was restored; execution outcome is unknown. This job will not be relaunched."; r.readiness = "unavailable"; save(r); }
  records.set(r.processId, r);
}
function publicRecord(r) {
  const { fingerprint, probe, root, finishing, ...record } = r;
  return { ...record, command: clip(record.command, 1000) + (record.command.length > 1000 ? "…" : "") };
}
function owned(id) {
  const r = records.get(id);
  if (!r) throw new Error("Process unavailable: expired, sandbox replaced, or owned by another chat/task.");
  return r;
}
function logFile(r, stream) { return path.join(store, r.processId + "." + stream); }
function clip(text, limit) {
  let end = Math.min(text.length, limit);
  if (/[\uD800-\uDBFF]/.test(text.charAt(end - 1))) end--;
  return text.slice(0, end);
}
function append(r, stream, text) {
  const file = logFile(r, stream);
  const current = fs.statSync(file).size;
  const remaining = Math.max(0, LOG_LIMIT - current);
  const bytes = Buffer.from(text);
  if (bytes.length > remaining) {
    let end = remaining;
    while (end > 0 && (bytes[end] & 192) === 128) end--;
    fs.appendFileSync(file, bytes.subarray(0, end));
    if (!r.logsTruncated) { r.logsTruncated = true; save(r); }
  } else fs.appendFileSync(file, bytes);
  // Continue draining pipes even when retained logs reach the cap.
}
function start(input, id, root) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid launch ID.");
  const fingerprint = createHash("sha256").update(JSON.stringify({ input, root })).digest("hex");
  const previous = records.get(id);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new Error("Launch ID reused with different input.");
    return previous;
  }
  if (live.size >= 8 || records.size >= 100) throw new Error("Process capacity reached (8 active / 100 retained per scope). Stop unused jobs or wait for retention cleanup.");
  root = fs.realpathSync(root);
  const cwd = fs.realpathSync(path.resolve(root, input.cwd ?? "."));
  if (cwd !== root && !cwd.startsWith(root + path.sep)) throw new Error("Working directory must stay within the workspace, including symlink targets.");
  const now = Date.now();
  const r = { processId: id, commandId: "process:" + id, command: input.command, cwd, root, fingerprint, probe: input.readiness, state: "starting", readiness: input.readiness ? "pending" : "not_configured", startedAt: now, deadlineAt: now + input.timeoutSeconds * 1000, exitCode: null, logsTruncated: false };
  // Intent before spawn: even a crash in this gap cannot duplicate a launch.
  save(r);
  records.set(id, r);
  for (const stream of ["stdout", "stderr"]) fs.writeFileSync(logFile(r, stream), "", { mode: 384 });
  const child = spawn(process.execPath, [runner, JSON.stringify({ command: input.command, cwd, deadlineAt: r.deadlineAt })], { detached: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  live.set(id, child);
  let result;
  for (const stream of ["stdout", "stderr"]) {
    const decoder = new StringDecoder("utf8");
    child[stream].on("data", chunk => append(r, stream, decoder.write(chunk)));
    child[stream].on("end", () => append(r, stream, decoder.end()));
  }
  child.on("message", message => {
    if (message.kind === "started" && !result) { r.state = "running"; save(r); }
    if (message.kind === "result") { result = message; r.finishing = true; r.readiness = r.probe ? "unavailable" : "not_configured"; save(r); }
  });
  child.on("error", error => { result = { state: "error", exitCode: null, error: error.message }; });
  child.on("close", () => {
    live.delete(id);
    Object.assign(r, result ?? { state: "expired", exitCode: null, error: "Process runner disappeared; outcome unknown." });
    delete r.kind;
    r.endedAt = Date.now();
    r.readiness = r.probe ? "unavailable" : "not_configured";
    if (r.probe) r.readinessDetail = "Process terminated; readiness is unavailable.";
    save(r);
  });
  return r;
}
async function probe(r) {
  if (!r.probe || r.state !== "running" || r.finishing) return;
  r.readinessCheckedAt = Date.now();
  let ready = false;
  let detail;
  if (r.probe.kind === "log") {
    ready = ["stdout", "stderr"].some(stream => fs.readFileSync(logFile(r, stream), "utf8").includes(r.probe.text));
    detail = ready ? "Expected text observed in retained logs; this is not a health check." : "Expected text not present in retained logs.";
  } else {
    const url = new URL(r.probe.url);
    if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) throw new Error("Readiness URL must be loopback HTTP(S) without credentials.");
    // Pin DNS to loopback, never follow redirects, and never retain response bodies.
    ready = await new Promise(resolve => {
      const request = (url.protocol === "https:" ? https : http).get(url, { lookup: (_host, options, cb) => options.all ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(null, "127.0.0.1", 4) }, response => {
        const ok = response.statusCode === r.probe.status;
        response.destroy();
        resolve(ok);
      });
      const timer = setTimeout(() => request.destroy(new Error("Probe timed out")), 1000);
      request.on("close", () => clearTimeout(timer));
      request.on("error", () => resolve(false));
    });
    detail = ready ? "Expected HTTP status observed at the configured endpoint; endpoint ownership and UI behavior are not verified." : "Endpoint did not return the expected HTTP status (redirects are not followed).";
  }
  if (!active(r) || r.finishing) return;
  r.readiness = ready ? "ready" : "pending";
  r.readinessDetail = detail;
  save(r);
}
async function handle(request) {
  const input = request.input;
  let r;
  if (input.action === "start") r = start(input, request.id, request.root);
  else if (input.action === "list") return { success: true, processes: [...records.values()].map(publicRecord) };
  else r = owned(input.processId);
  let waitTimedOut;
  let log;
  if (input.action === "stop" && active(r)) {
    const child = live.get(r.processId);
    if (!child?.connected) throw new Error("Process controller unavailable; stop could not be confirmed.");
    child.send("stop");
    const deadline = Date.now() + 3000;
    while (active(r) && Date.now() < deadline) await sleep(50);
    if (active(r)) throw new Error("Stop requested but not yet confirmed; poll status.");
  }
  if (input.action === "status") await probe(r);
  if (input.action === "wait") {
    if (input.until === "ready" && !r.probe) throw new Error("No readiness check configured for this process.");
    const deadline = Date.now() + input.timeoutSeconds * 1000;
    do {
      if (input.until === "ready") await probe(r);
      if (!active(r) || (input.until === "ready" && r.readiness === "ready")) break;
      if (Date.now() >= deadline) { waitTimedOut = true; break; }
      await sleep(Math.min(100, deadline - Date.now()));
    } while (true);
  }
  if (input.action === "logs") {
    const text = fs.readFileSync(logFile(r, input.stream), "utf8");
    let offset = Math.min(text.length, input.offset);
    if (/[\uDC00-\uDFFF]/.test(text.charAt(offset))) offset--;
    const content = clip(text.slice(offset), input.limit);
    const end = offset + content.length;
    log = { stream: input.stream, content, offset, totalCharacters: text.length, ...(end < text.length ? { nextOffset: end } : {}), truncated: r.logsTruncated };
  }
  return { success: true, process: publicRecord(r), ...(waitTimedOut ? { waitTimedOut } : {}), ...(log ? { log } : {}) };
}
const server = net.createServer(socket => {
  socket.setEncoding("utf8");
  socket.on("error", () => {});
  socket.setTimeout(40000, () => socket.destroy());
  let data = "";
  socket.on("data", chunk => {
    data += chunk;
    if (data.length > 100000) { socket.destroy(); return; }
    if (!data.includes("\n")) return;
    socket.removeAllListeners("data");
    lastActivity = Date.now();
    // Start's preflight + journal + spawn are synchronous. Wait yields so stop
    // and status from other clients remain available during a long wait.
    handle(JSON.parse(data.slice(0, data.indexOf("\n")))).then(
      result => socket.end(JSON.stringify({ ...result, observedAt: Date.now() }) + "\n"),
      error => socket.end(JSON.stringify({ success: false, error: String(error.message).slice(0, 1500) }) + "\n"),
    );
  });
});
server.listen(path.join(store, "process.sock"), () => fs.chmodSync(path.join(store, "process.sock"), 384));
setInterval(() => {
  for (const [id, r] of records) {
    if (active(r) || Date.now() - (r.endedAt ?? r.startedAt) < RETENTION) continue;
    for (const suffix of [".json", ".stdout", ".stderr"]) fs.rmSync(path.join(store, id + suffix), { force: true });
    records.delete(id);
  }
  if (!live.size && Date.now() - lastActivity > 15 * 60 * 1000) server.close(() => process.exit(0));
}, 30000).unref();
process.on("SIGTERM", () => {
  for (const child of live.values()) if (child.connected) child.disconnect();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
});
`;
