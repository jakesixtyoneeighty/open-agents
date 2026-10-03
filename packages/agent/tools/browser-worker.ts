/** Shipped verbatim to the existing sandbox Playwright runtime; tested with Chromium. */
export const BROWSER_WORKER = String.raw`
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { chromium } from "playwright";
const [store] = process.argv.slice(2);
const sessions = new Map();
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, tablet: { width: 834, height: 1112 }, mobile: { width: 390, height: 844 } };
const IDLE = 15 * 60 * 1000;
const RETENTION = 6 * 60 * 60 * 1000;
let browser;
let lastActivity = Date.now();
let queue = Promise.resolve();
const fail = message => { throw new Error(message); };
const clip = (value, limit) => {
  const text = String(value);
  let end = text.length > limit ? limit - 1 : limit;
  if (text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) end--;
  return text.slice(0, end) + (text.length > limit ? "…" : "");
};
const safeUrl = value => {
  try { const url = new URL(value); return clip(url.origin + url.pathname, 500); }
  catch { return "[unavailable URL]"; }
};
function previewUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) fail("Only loopback http(s) previews are supported.");
  return url;
}
function append(session, kind, entry) {
  session[kind].push(entry);
  if (session[kind].length > 20) { session[kind].shift(); session.dropped[kind]++; }
}
async function open(input) {
  const url = previewUrl(input.url);
  if (sessions.size >= 4) fail("Close an existing browser session first (limit: 4 per chat or task).");
  if (!VIEWPORTS[input.viewport]) fail("Invalid viewport.");
  browser ??= await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORTS[input.viewport], isMobile: input.viewport === "mobile", hasTouch: input.viewport === "mobile", serviceWorkers: "block", acceptDownloads: false });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(20000);
  const session = { id: randomUUID(), context, page, origin: url.origin, viewport: input.viewport, console: [], network: [], dropped: { console: 0, network: 0 }, status: null, touched: Date.now() };
  // This is preview testing, not arbitrary browsing. Keep document navigation
  // (including redirects/popups) on the initial preview origin.
  await context.route("**/*", async route => {
    const request = route.request();
    if (!request.isNavigationRequest()) return route.continue();
    if (new URL(request.url()).origin !== session.origin) return route.abort("blockedbyclient");
    try {
      // Playwright's route handler is not reinvoked for a server redirect.
      // Inspect the response before the browser can follow it; callers use the
      // final local URL directly instead of implicitly following redirects.
      const response = await route.fetch({ maxRedirects: 0, timeout: 15000 });
      if (response.status() >= 300 && response.status() < 400 && response.headers().location) {
        append(session, "console", { type: "navigation-blocked", text: "Document redirect blocked. Open the final loopback preview URL directly." });
        await route.abort("blockedbyclient");
      } else await route.fulfill({ response });
      await response.dispose();
    } catch { await route.abort("failed").catch(() => {}); }
  });
  context.on("page", popup => { if (popup !== page) void popup.close().catch(() => {}); });
  page.on("console", message => append(session, "console", { type: message.type(), text: clip(message.text(), 500) }));
  page.on("pageerror", error => append(session, "console", { type: "pageerror", text: clip(error.message, 500) }));
  page.on("response", response => {
    const request = response.request();
    append(session, "network", { url: safeUrl(response.url()), method: request.method(), status: response.status() });
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) session.status = response.status();
  });
  page.on("requestfailed", request => append(session, "network", { url: safeUrl(request.url()), method: request.method(), error: clip(request.failure()?.errorText ?? "Request failed", 300) }));
  sessions.set(session.id, session);
  return session;
}
async function close(session) {
  sessions.delete(session.id);
  await session.context.close();
}
async function inspect(session) {
  const snapshot = await session.page.locator("body").ariaSnapshot({ timeout: 8000 });
  const focused = await session.page.evaluate(() => {
    const el = document.activeElement;
    return el ? [el.tagName.toLowerCase(), el.getAttribute("role"), el.getAttribute("aria-label"), el.id].filter(Boolean).join(" ") : "none";
  });
  return {
    sessionId: session.id, url: safeUrl(session.page.url()), title: clip(await session.page.title(), 300), viewport: session.viewport,
    status: session.status, snapshot: clip(snapshot, 12000), focused: clip(focused, 500),
    console: [...session.console], network: [...session.network],
    truncated: { snapshot: snapshot.length > 12000, ...session.dropped },
  };
}
async function act(session, action) {
  const page = session.page;
  const locator = action.target ? page.getByRole(action.target.role, { name: action.target.name, exact: true }) : undefined;
  switch (action.kind) {
    case "click": await locator.click(); break;
    case "fill": await locator.fill(action.value); break;
    case "select": await locator.selectOption(action.value); break;
    case "check": await locator.setChecked(action.checked); break;
    case "press":
      if (!["Tab", "Shift+Tab", "Enter", "Space", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(action.key)) fail("Unsupported key.");
      await page.keyboard.press(action.key); break;
    case "navigate":
      if (previewUrl(action.url).origin !== session.origin) fail("Navigation must stay on the initial preview origin.");
      await page.goto(action.url, { waitUntil: "load" }); break;
    case "expect_text": await page.getByText(action.text, { exact: true }).waitFor({ state: "visible" }); break;
    default: fail("Unsupported browser action.");
  }
}
async function execute(request) {
  const { kind, input } = request;
  let session;
  let ephemeral = false;
  let action;
  try {
    if ((kind === "session" && input.action === "open") || (kind === "inspect" && input.url)) {
      ephemeral = kind === "inspect";
      session = await open(input);
      await session.page.goto(input.url, { waitUntil: "load" });
    }
    else {
      session = sessions.get(input.sessionId);
      if (!session) fail("Browser session expired, closed, or belongs to another chat/task. Open a new session; state is not restored after sandbox hibernation.");
      session.touched = Date.now();
      if (kind === "session" && input.action === "close") {
        await close(session);
        return { success: true, sessionId: session.id, closed: true };
      }
      if (kind === "action") { action = input.action.kind; await act(session, input.action); }
      else if (kind !== "inspect") fail("Unsupported browser operation.");
    }
    return { success: true, ...await inspect(session), ...(action ? { action } : {}), ...(ephemeral ? { closed: true } : {}) };
  } catch (error) {
    let evidence = session ? { sessionId: session.id, ...(ephemeral ? { closed: true } : {}) } : {};
    if (session && !session.page.isClosed()) { try { evidence = { ...evidence, ...await inspect(session) }; } catch {} }
    return { success: false, ...evidence, ...(action ? { action } : {}), error: clip(error.message, 1500) };
  } finally {
    if (ephemeral && session) await close(session).catch(() => {});
  }
}
async function handle(request) {
  if (!/^[a-f0-9]{64}$/.test(request.id)) fail("Invalid evidence ID.");
  const file = path.join(store, request.id + ".json");
  const fingerprint = createHash("sha256").update(JSON.stringify({ kind: request.kind, input: request.input })).digest("hex");
  if (fs.existsSync(file)) {
    const previous = JSON.parse(fs.readFileSync(file, "utf8"));
    if (previous.fingerprint !== fingerprint) fail("Browser call ID was reused with different input.");
    return previous.result ?? { success: false, evidenceId: request.id, error: "Prior browser call was interrupted; its effects are unknown. Inspect the page before a new action. This call will not be replayed." };
  }
  const records = fs.readdirSync(store).filter(name => /^[a-f0-9]{64}\.json$/.test(name));
  const bytes = records.reduce((sum, name) => sum + fs.statSync(path.join(store, name)).size, 0);
  if (bytes > 32 * 1024 * 1024) fail("Browser evidence storage limit reached (32 MiB). Existing results remain retrievable; wait for retention cleanup before new calls.");
  // Persist intent before input events: retry never double-submits a form.
  fs.writeFileSync(file, JSON.stringify({ fingerprint }), { mode: 384, flag: "wx" });
  const result = { ...await execute(request), evidenceId: request.id, capturedAt: Date.now() };
  fs.writeFileSync(file + ".tmp", JSON.stringify({ fingerprint, result }), { mode: 384 });
  fs.renameSync(file + ".tmp", file);
  return result;
}
const server = net.createServer(socket => {
  socket.setEncoding("utf8");
  let payload = "";
  socket.setTimeout(60000, () => socket.destroy());
  socket.on("error", () => {});
  socket.on("data", chunk => {
    payload += chunk.toString();
    if (payload.length > 20000) { socket.destroy(); return; }
    const end = payload.indexOf("\n");
    if (end < 0) return;
    socket.removeAllListeners("data");
    const run = async () => {
      lastActivity = Date.now();
      try { socket.end(JSON.stringify(await handle(JSON.parse(payload.slice(0, end)))) + "\n"); }
      catch (error) { socket.end(JSON.stringify({ success: false, error: clip(error.message, 1500) }) + "\n"); }
      lastActivity = Date.now();
    };
    queue = queue.then(run, run);
  });
});
server.on("error", () => process.exit(1));
server.listen(path.join(store, "browser.sock"), () => fs.chmodSync(path.join(store, "browser.sock"), 384));
const cleanup = setInterval(() => {
  queue = queue.then(async () => {
    for (const session of sessions.values()) if (Date.now() - session.touched > IDLE) await close(session).catch(() => {});
    for (const name of fs.readdirSync(store)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const file = path.join(store, name);
      if (Date.now() - fs.statSync(file).mtimeMs > RETENTION) fs.unlinkSync(file);
    }
    if (!sessions.size && Date.now() - lastActivity > IDLE) {
      clearInterval(cleanup);
      await browser?.close();
      server.close(() => process.exit(0));
    }
  }).catch(() => {});
}, 30000);
process.on("SIGTERM", async () => { await browser?.close(); process.exit(0); });
`;

/** Caller holds the scope's OS lock, including daemon startup and stale-socket recovery. */
export const BROWSER_CLIENT = String.raw`
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
const [store, worker, requestPath, outputPath] = process.argv.slice(2);
const socketPath = path.join(store, "browser.sock");
const request = fs.readFileSync(requestPath, "utf8");
const finish = value => {
  if (outputPath) fs.writeFileSync(outputPath, value, { mode: 384 });
  else process.stdout.write(value);
};
function call() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    socket.setEncoding("utf8");
    let data = "";
    socket.setTimeout(55000, () => socket.destroy(new Error("Browser timed out; action outcome may be unknown. Retry the same call to recover evidence.")));
    socket.on("connect", () => socket.write(request + "\n"));
    socket.on("data", chunk => { data += chunk.toString(); if (data.length > 512000) socket.destroy(new Error("Browser evidence exceeded limit.")); });
    socket.on("end", () => { if (!data.trim()) reject(new Error("Browser disconnected; outcome unknown.")); else resolve(data); });
    socket.on("error", reject);
  });
}
try {
  let output;
  try { output = await call(); }
  catch (error) {
    if (!["ENOENT", "ECONNREFUSED"].includes(error.code)) throw error;
    fs.rmSync(socketPath, { force: true });
    const child = spawn(process.execPath, [worker, store], { detached: true, stdio: "ignore" });
    child.unref();
    for (let attempt = 0; attempt < 50; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      try { output = await call(); break; }
      catch (startupError) { if (!["ENOENT", "ECONNREFUSED"].includes(startupError.code)) throw startupError; }
    }
    if (!output) throw new Error("Browser runtime unavailable. Check the installed Playwright runtime.");
  }
  finish(output);
} catch (error) { finish(JSON.stringify({ success: false, error: error.message })); }
`;
