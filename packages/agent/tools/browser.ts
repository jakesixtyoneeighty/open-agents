import { createHash, randomUUID } from "node:crypto";
import { tool } from "ai";
import { BROWSER_CLIENT, BROWSER_WORKER } from "./browser-worker";
import { SETUP_SCRIPT, SETUP_TIMEOUT_MS } from "./browser-setup";
import {
  browserActionSchema,
  browserInspectSchema,
  browserOutputSchema,
  browserSessionSchema,
  type BrowserOutput,
} from "./browser-schema";
import { getSandbox, shellEscape } from "./utils";

/** The host supplies this scope; it is never a model-controlled tool argument. */
export function getBrowserScope(context: unknown): string | undefined {
  if (
    typeof context !== "object" ||
    context === null ||
    !("browserScope" in context)
  )
    return undefined;
  return typeof context.browserScope === "string" && context.browserScope
    ? context.browserScope
    : undefined;
}

export async function executeBrowser(
  kind: "session" | "inspect" | "action",
  input: unknown,
  context: unknown,
  toolCallId: string,
  signal?: AbortSignal,
): Promise<BrowserOutput> {
  try {
    const scope = getBrowserScope(context);
    if (!scope)
      throw new Error(
        "Browser verification is unavailable: the host did not supply a chat/task scope.",
      );
    const sandbox = await getSandbox(context, `browser_${kind}`);
    const hash = (text: string) =>
      createHash("sha256").update(text).digest("hex");
    const runtimeVersion = hash(BROWSER_WORKER + BROWSER_CLIENT).slice(0, 12);
    const store = `/var/tmp/oa-browser-${hash(scope).slice(0, 24)}-${runtimeVersion}`;
    const requestPath = `${store}/request-${randomUUID()}`;
    const outputPath = `${requestPath}.result`;
    // Serialize dependency installation with the legacy screenshot runtime.
    const setup = await sandbox.exec(
      `mkdir -p "$HOME/.open-agents/browser" && flock -w 300 "$HOME/.open-agents/browser/setup.lock" sh -c ${shellEscape(SETUP_SCRIPT)}`,
      sandbox.workingDirectory,
      SETUP_TIMEOUT_MS,
      { signal },
    );
    if (!setup.success)
      throw new Error(
        `Browser setup failed: ${(setup.stderr || setup.stdout).slice(-1000)}`,
      );
    const home = await sandbox.exec(
      'printf %s "$HOME"',
      sandbox.workingDirectory,
      10000,
      { signal },
    );
    if (!home.success || !home.stdout.trim().startsWith("/"))
      throw new Error("Could not resolve browser runtime directory.");
    const runtime = `${home.stdout.trim()}/.open-agents/browser`;
    const workerPath = `${runtime}/worker-${runtimeVersion}.mjs`;
    const clientPath = `${runtime}/client-${runtimeVersion}.mjs`;
    const mkdir = await sandbox.exec(
      `mkdir -p -m 700 ${shellEscape(store)}`,
      sandbox.workingDirectory,
      10000,
      { signal },
    );
    if (!mkdir.success)
      throw new Error("Could not prepare browser evidence storage.");
    // Unique files then atomic rename prevent concurrent steps reading partial scripts.
    const suffix = randomUUID();
    await sandbox.writeFile(`${workerPath}.${suffix}`, BROWSER_WORKER, "utf-8");
    await sandbox.writeFile(`${clientPath}.${suffix}`, BROWSER_CLIENT, "utf-8");
    const installed = await sandbox.exec(
      `mv ${shellEscape(`${workerPath}.${suffix}`)} ${shellEscape(workerPath)} && mv ${shellEscape(`${clientPath}.${suffix}`)} ${shellEscape(clientPath)}`,
      sandbox.workingDirectory,
      10000,
      { signal },
    );
    if (!installed.success)
      throw new Error("Could not install browser worker.");
    const id = hash(`${scope}:${kind}:${toolCallId}`);
    await sandbox.writeFile(
      requestPath,
      JSON.stringify({ id, kind, input }),
      "utf-8",
    );
    try {
      const result = await sandbox.exec(
        `flock -w 60 ${shellEscape(`${store}/client.lock`)} node ${shellEscape(clientPath)} ${shellEscape(store)} ${shellEscape(workerPath)} ${shellEscape(requestPath)} ${shellEscape(outputPath)}`,
        sandbox.workingDirectory,
        120000,
        { signal },
      );
      if (!result.success)
        throw new Error(
          "Browser execution interrupted or lock timed out; outcome may be unknown. Retry the same call to recover evidence before taking another action.",
        );
      // exec stdout is truncated by the sandbox adapter. Transfer the bounded
      // evidence as a file so even heavily escaped JSON remains intact.
      return browserOutputSchema.parse(
        JSON.parse(await sandbox.readFile(outputPath, "utf-8")),
      );
    } finally {
      await sandbox
        .exec(
          `rm -f -- ${shellEscape(requestPath)} ${shellEscape(outputPath)}`,
          sandbox.workingDirectory,
          10000,
        )
        .catch(() => {});
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Browser verification failed",
    };
  }
}

export const browserSessionTool = tool({
  needsApproval: false,
  description:
    "Open/close an isolated browser session for an already-running loopback preview. Start the dev server first. Choose desktop, tablet or mobile. Use the final URL directly: document redirects are blocked. Cookies and page state persist between calls in this chat/task only, for 15 minutes idle; sandbox hibernation/replacement loses sessions. Close sessions when finished (maximum four). A successful open is inspection evidence, not interaction verification.",
  inputSchema: browserSessionSchema,
  outputSchema: browserOutputSchema,
  execute: (input, { experimental_context, toolCallId, abortSignal }) =>
    executeBrowser(
      "session",
      input,
      experimental_context,
      toolCallId,
      abortSignal,
    ),
});
export const browserInspectTool = tool({
  needsApproval: false,
  description:
    "Inspect a browser session, or inspect a loopback preview URL in a fresh context that closes afterward. Returns an accessibility snapshot, focused element, HTTP status, recent console/network evidence and truncation counts. No clicks, typing or arbitrary JavaScript. URL inspection loads the page and runs its scripts; it does not prove the app is free of side effects. Evidence is stored in chat history; it is a point-in-time observation, not proof that a flow passed. Network metadata omits headers, bodies and URL queries. Page/console content can contain application data.",
  inputSchema: browserInspectSchema,
  outputSchema: browserOutputSchema,
  execute: (input, { experimental_context, toolCallId, abortSignal }) =>
    executeBrowser(
      "inspect",
      input,
      experimental_context,
      toolCallId,
      abortSignal,
    ),
});
export const browserActionTool = tool({
  needsApproval: false,
  description:
    "Test an authorized preview interaction in an owned browser session: click/fill/select/check by exact accessible role and name, keyboard press, same-origin navigation, or expect_text (wait for exact visible text). Inspect first; ambiguous targets fail. Returns evidence after the action, including failures. A successful input event alone does not prove the intended outcome: follow with expect_text and inspect. Test desktop/mobile and keyboard flows explicitly. Actions can change application data; do not submit destructive or external actions without user authorization. No arbitrary scripts, uploads, downloads, popups, document redirects or external document navigation. Do not enter secrets; tool inputs are saved in chat history.",
  inputSchema: browserActionSchema,
  outputSchema: browserOutputSchema,
  execute: (input, { experimental_context, toolCallId, abortSignal }) =>
    executeBrowser(
      "action",
      input,
      experimental_context,
      toolCallId,
      abortSignal,
    ),
});
