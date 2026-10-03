import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
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
import { join } from "node:path";
import { PROCESS_WORKER } from "./process-worker";
import { PROCESS_RUNNER } from "./process-runner";
import { PROCESS_CLIENT } from "./process-client";
import {
  processInputSchema,
  processOutputSchema,
  type ProcessOutput,
} from "./process-schema";

let root: string;
let store: string;
let worker: ChildProcess;
let diagnostics = "";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const id = (value: string) => createHash("sha256").update(value).digest("hex");

function send(
  input: unknown,
  callId = "read",
  target = store,
): Promise<ProcessOutput> {
  const request = {
    input: processInputSchema.parse(input),
    id: id(callId),
    root: join(root, "workspace"),
  };
  return new Promise((resolve, reject) => {
    const socket = createConnection(join(target, "process.sock"));
    socket.setEncoding("utf8");
    socket.setTimeout(5000, () =>
      socket.destroy(new Error("Test request timeout")),
    );
    let data = "";
    socket.on("connect", () => socket.write(JSON.stringify(request) + "\n"));
    socket.on("data", (chunk) => {
      data += chunk;
    });
    socket.on("error", reject);
    socket.on("end", () => {
      try {
        resolve(processOutputSchema.parse(JSON.parse(data)));
      } catch (error) {
        reject(error);
      }
    });
  });
}
async function launch(target = store) {
  await rm(join(target, "process.sock"), { force: true });
  const child = spawn(
    "node",
    [join(root, "worker.mjs"), target, join(root, "runner.mjs")],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  child.stderr?.on("data", (chunk) => {
    diagnostics += String(chunk);
  });
  for (let i = 0; i < 100; i++) {
    try {
      await send({ action: "list" }, "list", target);
      return child;
    } catch {
      await sleep(20);
    }
  }
  throw new Error(`Worker unavailable: ${diagnostics}`);
}
async function stopWorker(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
  });
}
async function start(
  command: string,
  name: string,
  extra: Record<string, unknown> = {},
) {
  const output = await send({ action: "start", command, ...extra }, name);
  if (!output.success || !output.process)
    throw new Error(JSON.stringify(output));
  return output.process.processId;
}
beforeAll(async () => {
  root = await mkdtemp("/tmp/oa-proc-");
  store = join(root, "state");
  await mkdir(store);
  await mkdir(join(root, "workspace"));
  await writeFile(join(root, "worker.mjs"), PROCESS_WORKER);
  await writeFile(join(root, "runner.mjs"), PROCESS_RUNNER);
  await writeFile(join(root, "client.mjs"), PROCESS_CLIENT);
  worker = await launch();
});
afterAll(async () => {
  await stopWorker(worker);
  await rm(root, { recursive: true, force: true });
});

test("launch is distinct from readiness, survives client calls and deduplicates retries", async () => {
  const command = "printf x >> count; sleep 0.2; printf 'READY 😀'; sleep 10";
  const processId = await start(command, "ready", {
    readiness: { kind: "log", text: "READY 😀" },
  });
  const retry = await send(
    { action: "start", command, readiness: { kind: "log", text: "READY 😀" } },
    "ready",
  );
  expect(retry.process?.processId).toBe(processId);
  expect(
    (await send({ action: "start", command: "echo changed" }, "ready")).success,
  ).toBe(false);
  const ready = await send({
    action: "wait",
    processId,
    until: "ready",
    timeoutSeconds: 2,
  });
  expect(ready.process?.readiness).toBe("ready");
  expect(await readFile(join(root, "workspace/count"), "utf8")).toBe("x");
  expect((await send({ action: "stop", processId })).process?.state).toBe(
    "stopped",
  );
  expect((await send({ action: "stop", processId })).process?.state).toBe(
    "stopped",
  );
});

test("actual exit status and Unicode log continuation survive completion", async () => {
  const processId = await start(
    "printf 'a😀b😀c'; printf 'failure' >&2; exit 7",
    "exit",
  );
  const done = await send({ action: "wait", processId, timeoutSeconds: 2 });
  expect(done.process?.state).toBe("exited");
  expect(done.process?.exitCode).toBe(7);
  let offset = 0;
  let combined = "";
  for (let i = 0; i < 10; i++) {
    const result = await send({ action: "logs", processId, offset, limit: 2 });
    expect(result.log).toBeDefined();
    combined += result.log!.content;
    if (result.log!.nextOffset === undefined) break;
    offset = result.log!.nextOffset!;
  }
  expect(combined).toBe("a😀b😀c");
  expect(
    (await send({ action: "logs", processId, stream: "stderr" })).log?.content,
  ).toBe("failure");
});

test("bounded wait does not stop the job; stop remains responsive during wait", async () => {
  const processId = await start("sleep 20", "wait");
  const pending = await send({ action: "wait", processId, timeoutSeconds: 1 });
  expect(pending.waitTimedOut).toBe(true);
  expect(pending.process?.state).toBe("running");
  const waiting = send({ action: "wait", processId, timeoutSeconds: 3 });
  await sleep(30);
  expect((await send({ action: "stop", processId })).process?.state).toBe(
    "stopped",
  );
  expect((await waiting).process?.state).toBe("stopped");
});

test("runtime deadline is distinct from normal failure", async () => {
  const processId = await start("sleep 20", "deadline", { timeoutSeconds: 1 });
  const result = await send({ action: "wait", processId, timeoutSeconds: 3 });
  expect(result.process?.state).toBe("timed_out");
  expect(result.process?.exitCode).toBeNull();
  expect(result.waitTimedOut).toBeUndefined();
});

test("stop kills owned descendants that ignore TERM, while unrelated jobs survive", async () => {
  const processId = await start(
    "bash -c 'trap \"\" TERM; while true; do echo tick >> ticks; sleep 0.1; done' & wait",
    "descendants",
  );
  const other = await start("sleep 20", "unrelated");
  await sleep(300);
  expect((await send({ action: "stop", processId })).process?.state).toBe(
    "stopped",
  );
  const before = await readFile(join(root, "workspace/ticks"), "utf8");
  await sleep(300);
  expect(await readFile(join(root, "workspace/ticks"), "utf8")).toBe(before);
  expect(
    (await send({ action: "status", processId: other })).process?.state,
  ).toBe("running");
  await send({ action: "stop", processId: other });
});

test("ownership, traversal and symlink escape fail closed", async () => {
  expect(
    (await send({ action: "stop", processId: id("foreign") })).success,
  ).toBe(false);
  expect(
    (await send({ action: "start", command: "true", cwd: ".." }, "traversal"))
      .success,
  ).toBe(false);
  await symlink(root, join(root, "workspace/escape"));
  expect(
    (await send({ action: "start", command: "true", cwd: "escape" }, "symlink"))
      .success,
  ).toBe(false);
  const foreignStore = join(root, "foreign");
  await mkdir(foreignStore);
  const foreignWorker = await launch(foreignStore);
  const processId = await start("sleep 20", "owned");
  try {
    expect(
      (await send({ action: "stop", processId }, "stop", foreignStore)).success,
    ).toBe(false);
    expect(
      (await send({ action: "logs", processId }, "logs", foreignStore)).success,
    ).toBe(false);
    expect(["starting", "running"]).toContain(
      (await send({ action: "status", processId })).process?.state ?? "missing",
    );
  } finally {
    await send({ action: "stop", processId });
    await stopWorker(foreignWorker);
  }
});

test("HTTP readiness requires expected status and does not follow redirects", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/redirect")
      response.writeHead(302, { Location: "/ok" });
    response.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No HTTP address");
  const url = `http://localhost:${address.port}`;
  const good = await start("sleep 20", "http", {
    readiness: { kind: "http", url: `${url}/ok` },
  });
  const redirect = await start("sleep 20", "redirect", {
    readiness: { kind: "http", url: `${url}/redirect` },
  });
  try {
    expect(
      (
        await send({
          action: "wait",
          processId: good,
          until: "ready",
          timeoutSeconds: 2,
        })
      ).process?.readiness,
    ).toBe("ready");
    expect(
      (await send({ action: "status", processId: redirect })).process
        ?.readiness,
    ).toBe("pending");
  } finally {
    await send({ action: "stop", processId: good });
    await send({ action: "stop", processId: redirect });
    server.close();
  }
});

test("logs stay bounded without blocking a noisy process", async () => {
  const processId = await start(
    "node -e 'process.stdout.write(\"😀\".repeat(300000))'",
    "large",
  );
  const done = await send({ action: "wait", processId, timeoutSeconds: 3 });
  expect(done.process?.exitCode).toBe(0);
  const log = await send({
    action: "logs",
    processId,
    offset: 524284,
    limit: 20,
  });
  expect(log.log?.truncated).toBe(true);
  expect(log.log?.content).not.toContain("�");
  expect(
    Buffer.byteLength(
      await readFile(join(store, `${processId}.stdout`), "utf8"),
    ),
  ).toBeLessThanOrEqual(1024 * 1024);
});

test("controller loss reports expiry without replaying an uncertain launch", async () => {
  const processId = await start("printf x >> once; sleep 20", "restart");
  await sleep(100);
  await new Promise<void>((resolve) => {
    worker.once("exit", () => resolve());
    worker.kill("SIGKILL");
  });
  worker = await launch();
  const result = await send({ action: "status", processId });
  expect(result.process?.state).toBe("expired");
  const retry = await send(
    { action: "start", command: "printf x >> once; sleep 20" },
    "restart",
  );
  expect(retry.process?.state).toBe("expired");
  expect(await readFile(join(root, "workspace/once"), "utf8")).toBe("x");
});
