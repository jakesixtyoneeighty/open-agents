import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { BROWSER_CLIENT, BROWSER_WORKER } from "./browser-worker";
import { browserOutputSchema, type BrowserOutput } from "./browser-schema";

const fixture = `<!doctype html><html><head><title>Preview fixture</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<h1>Preview</h1><p id="viewport"></p><p id="stored"></p><label>Name <input id="name" aria-label="Name"></label><button id="save">Save</button><button id="counter">Count</button><p id="result">Ready</p>
<button>Duplicate</button><button>Duplicate</button><a href="http://example.com">External</a>
<script>
document.querySelector('#save').onclick = () => { localStorage.setItem('name', document.querySelector('#name').value); document.querySelector('#result').textContent = 'Saved ' + localStorage.getItem('name'); };
let count = 0; document.querySelector('#counter').onclick = () => { document.querySelector('#result').textContent = 'Count ' + (++count); };
console.error('fixture console evidence'); fetch('/missing?token=hidden');
document.querySelector('#viewport').textContent = 'Viewport ' + innerWidth;
document.querySelector('#stored').textContent = localStorage.getItem('name') || 'No saved name';
</script></body></html>`;
let root: string;
let store: string;
let worker: ChildProcess;
let url: string;
let diagnostics = "";
const server = createServer((req, res) => {
  if (req.url?.startsWith("/redirect")) {
    res.writeHead(302, { Location: "http://example.com" });
    res.end();
    return;
  }
  if (req.url?.startsWith("/missing")) {
    res.writeHead(404);
    res.end("missing");
    return;
  }
  if (req.url?.startsWith("/large")) {
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<body><h1>${Array.from({ length: 1500 }, (_, i) => `<button>Control ${i} 😀</button>`).join("")}</h1><script>for(let i=0;i<30;i++)console.log('event '+i)</script></body>`,
    );
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(fixture);
});

async function launch() {
  await rm(join(store, "browser.sock"), { force: true });
  worker = spawn("node", [join(root, "worker.mjs"), store], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  worker.stderr?.on("data", (data) => {
    diagnostics += String(data);
  });
  for (let i = 0; i < 100; i++) {
    try {
      await send({ id: "invalid", kind: "inspect", input: {} });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }
  throw new Error(`Browser worker unavailable: ${diagnostics}`);
}
async function stop() {
  if (worker.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    worker.once("exit", () => resolve());
    worker.kill("SIGTERM");
  });
}
function send(request: unknown): Promise<BrowserOutput> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(join(store, "browser.sock"));
    socket.setEncoding("utf8");
    socket.setTimeout(40000, () =>
      socket.destroy(new Error("Test browser request timed out")),
    );
    let data = "";
    socket.on("connect", () => socket.write(JSON.stringify(request) + "\n"));
    socket.on("data", (chunk) => {
      data += chunk;
    });
    socket.on("error", reject);
    socket.on("end", () => {
      try {
        resolve(browserOutputSchema.parse(JSON.parse(data)));
      } catch (error) {
        reject(error);
      }
    });
  });
}
const id = () => createHash("sha256").update(randomUUID()).digest("hex");
const call = (kind: string, input: unknown, requestId = id()) =>
  send({ kind, input, id: requestId });
async function open(viewport = "desktop") {
  const result = await call("session", { action: "open", url, viewport });
  expect(result.success, result.error ?? diagnostics).toBe(true);
  expect(result.sessionId).toBeDefined();
  return result.sessionId!;
}
const close = (sessionId: string) =>
  call("session", { action: "close", sessionId });
const action = (sessionId: string, input: unknown) =>
  call("action", { sessionId, action: input });

beforeAll(async () => {
  root = await mkdtemp("/tmp/oa-browser-test-");
  store = join(root, "scope");
  await mkdir(store);
  await mkdir(join(root, "node_modules"));
  const require = createRequire(import.meta.url);
  await symlink(
    dirname(require.resolve("playwright/package.json")),
    join(root, "node_modules/playwright"),
  );
  await writeFile(join(root, "worker.mjs"), BROWSER_WORKER);
  await writeFile(join(root, "client.mjs"), BROWSER_CLIENT);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  url = `http://127.0.0.1:${address.port}`;
  await launch();
}, 15000);
afterAll(async () => {
  await stop();
  server.closeAllConnections();
  server.close();
  await rm(root, { recursive: true, force: true });
});

for (const viewport of ["desktop", "mobile"] as const) {
  test(`real ${viewport} form flow, keyboard focus and stored evidence`, async () => {
    const sessionId = await open(viewport);
    const initial = await call("inspect", { sessionId });
    expect(initial.viewport).toBe(viewport);
    expect(initial.snapshot).toContain(
      viewport === "mobile" ? "Viewport 390" : "Viewport 1440",
    );
    expect(initial.snapshot).toContain('textbox "Name"');
    expect(
      initial.console?.some(
        (entry) => entry.text === "fixture console evidence",
      ),
    ).toBe(true);
    expect(initial.network?.some((entry) => entry.status === 404)).toBe(true);
    expect(JSON.stringify(initial.network)).not.toContain("hidden");
    const tab = await action(sessionId, { kind: "press", key: "Tab" });
    expect(tab.focused).toContain("name");
    expect(
      (
        await action(sessionId, {
          kind: "fill",
          target: { role: "textbox", name: "Name" },
          value: "Ada 😀",
        })
      ).success,
    ).toBe(true);
    const next = await action(sessionId, { kind: "press", key: "Tab" });
    expect(next.focused).toContain("save");
    expect(
      (await action(sessionId, { kind: "press", key: "Enter" })).success,
    ).toBe(true);
    const verified = await action(sessionId, {
      kind: "expect_text",
      text: "Saved Ada 😀",
    });
    expect(verified.success).toBe(true);
    expect(verified.snapshot).toContain("Saved Ada 😀");
    expect(verified.evidenceId).toHaveLength(64);
    await close(sessionId);
  }, 30000);
}

test("isolates page/storage state and serializes concurrent calls without replaying inputs", async () => {
  const first = await open();
  const second = await open();
  await action(first, {
    kind: "fill",
    target: { role: "textbox", name: "Name" },
    value: "Private",
  });
  await action(first, {
    kind: "click",
    target: { role: "button", name: "Save" },
  });
  const restored = await action(first, { kind: "navigate", url });
  expect(restored.snapshot).toContain("Private");
  const other = await call("inspect", { sessionId: second });
  expect(other.snapshot).not.toContain("Private");
  const requestId = id();
  const input = {
    sessionId: first,
    action: { kind: "click", target: { role: "button", name: "Count" } },
  };
  const [a, b] = await Promise.all([
    call("action", input, requestId),
    call("action", input, requestId),
  ]);
  expect(a).toEqual(b);
  expect(a.snapshot).toContain("Count 1");
  expect(
    (
      await call(
        "action",
        { ...input, action: { kind: "press", key: "Tab" } },
        requestId,
      )
    ).success,
  ).toBe(false);
  await close(first);
  await close(second);
}, 30000);

test("inspection is ephemeral, failures retain evidence, external navigation and unknown sessions fail", async () => {
  const ephemeral = await call("inspect", { url, viewport: "desktop" });
  expect(ephemeral.closed).toBe(true);
  expect(
    (await call("inspect", { sessionId: ephemeral.sessionId })).success,
  ).toBe(false);
  const sessionId = await open();
  const ambiguous = await action(sessionId, {
    kind: "click",
    target: { role: "button", name: "Duplicate" },
  });
  expect(ambiguous.success).toBe(false);
  expect(ambiguous.snapshot).toContain("Preview");
  expect(
    (
      await action(sessionId, {
        kind: "navigate",
        url: "http://localhost:9999",
      })
    ).success,
  ).toBe(false);
  expect(
    (await call("inspect", { url: url + "/redirect", viewport: "desktop" }))
      .success,
  ).toBe(false);
  expect((await call("inspect", { sessionId: randomUUID() })).error).toContain(
    "another chat/task",
  );
  await close(sessionId);
}, 30000);

test("bounds Unicode snapshots and console evidence with explicit omissions", async () => {
  const output = await call("inspect", {
    url: url + "/large",
    viewport: "mobile",
  });
  expect(output.success).toBe(true);
  expect(output.truncated?.snapshot).toBe(true);
  expect(output.truncated?.console).toBe(10);
  expect(output.console).toHaveLength(20);
  expect(output.snapshot!.length).toBeLessThanOrEqual(12000);
  expect(output.snapshot!.isWellFormed()).toBe(true);
}, 30000);

test("daemon restart expires sessions but keeps replay evidence and interrupted-call markers", async () => {
  const sessionId = await open();
  const requestId = id();
  const input = {
    sessionId,
    action: { kind: "click", target: { role: "button", name: "Count" } },
  };
  const previous = await call("action", input, requestId);
  await stop();
  await launch();
  expect(await call("action", input, requestId)).toEqual(previous);
  expect((await call("inspect", { sessionId })).error).toContain("expired");
  const interruptedId = id();
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ kind: "action", input }))
    .digest("hex");
  await writeFile(
    join(store, interruptedId + ".json"),
    JSON.stringify({ fingerprint }),
  );
  expect((await call("action", input, interruptedId)).error).toContain(
    "will not be replayed",
  );
}, 30000);

test("a separate chat daemon cannot inspect a live session owned by another scope", async () => {
  const sessionId = await open();
  const firstStore = store;
  const firstWorker = worker;
  store = join(root, "other-chat");
  await mkdir(store);
  try {
    await launch();
    expect((await call("inspect", { sessionId })).success).toBe(false);
  } finally {
    await stop();
    store = firstStore;
    worker = firstWorker;
  }
  expect((await call("inspect", { sessionId })).success).toBe(true);
  await close(sessionId);
}, 30000);

test("the shipped client recovers saved evidence over the request-file/socket protocol", async () => {
  const requestPath = join(store, "client-request");
  const requestId = id();
  const input = { url, viewport: "desktop" };
  const expected = await call("inspect", input, requestId);
  await writeFile(
    requestPath,
    JSON.stringify({ id: requestId, kind: "inspect", input }),
  );
  const output = await new Promise<string>((resolve, reject) => {
    const client = spawn("node", [
      join(root, "client.mjs"),
      store,
      join(root, "worker.mjs"),
      requestPath,
      requestPath + ".result",
    ]);
    let stdout = "";
    client.stdout.on("data", (data) => {
      stdout += String(data);
    });
    client.on("error", reject);
    client.on("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error("Browser client failed"));
    });
  });
  expect(output).toBe("");
  expect(
    browserOutputSchema.parse(
      JSON.parse(await readFile(requestPath + ".result", "utf8")),
    ),
  ).toEqual(expected);
}, 30000);
