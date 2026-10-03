import { createHash, randomUUID } from "node:crypto";
import type { Sandbox } from "@open-agents/sandbox";
import { shellEscape } from "../utils";
import { INTELLIGENCE_WORKER } from "./worker";
import {
  intelligenceResultSchema,
  type CodeInspectInput,
  type CodeRenameInput,
} from "./schema";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export async function queryIntelligence(
  sandbox: Sandbox,
  input: CodeInspectInput | CodeRenameInput,
  rename: boolean,
  signal?: AbortSignal,
  callKey?: string,
) {
  const store = `${sandbox.stateDirectory ?? "/var/tmp/open-agents"}/intelligence`;
  const runtime = `${store}/runtime-5.9.3`;
  const id = randomUUID();
  const request = `${store}/request-${id}.json`;
  const output = `${request}.result`;
  const worker = `${store}/worker-${hash(INTELLIGENCE_WORKER).slice(0, 16)}.cjs`;
  const saved =
    rename && callKey
      ? `${store}/rename-${hash(`${sandbox.workingDirectory}:${callKey}`)}.json`
      : undefined;
  const digest = hash(JSON.stringify(input));
  const run = async (command: string, timeout = 60_000) => {
    const result = await sandbox.exec(
      command,
      sandbox.workingDirectory,
      timeout,
      { signal },
    );
    if (!result.success)
      throw new Error(
        "Language service unavailable or timed out. It requires Node, pnpm, git, and registry access for first-time setup.",
      );
  };
  try {
    await run(`mkdir -p -m 700 ${shellEscape(runtime)}`);
    if (saved) {
      let prior: string | undefined;
      try {
        prior = await sandbox.readFile(saved, "utf-8");
      } catch {
        /* No saved plan yet. */
      }
      if (prior) {
        const plan: unknown = JSON.parse(prior);
        if (
          typeof plan !== "object" ||
          plan === null ||
          !("digest" in plan) ||
          plan.digest !== digest ||
          !("result" in plan)
        )
          throw new Error("Rename call ID already used for different input.");
        return intelligenceResultSchema.parse(plan.result);
      }
    }
    const setup = `set -e
DIR=${shellEscape(runtime)}
if [ ! -f "$DIR/node_modules/typescript/lib/typescript.js" ]; then
  printf '%s' '{"private":true}' > "$DIR/package.json"
  pnpm --dir "$DIR" add --ignore-scripts --save-exact typescript@5.9.3 >/dev/null
fi`;
    await run(
      `flock -w 120 ${shellEscape(`${store}/setup.lock`)} sh -c ${shellEscape(setup)}`,
      180_000,
    );
    await sandbox.writeFile(`${worker}.${id}`, INTELLIGENCE_WORKER, "utf-8");
    await run(`mv -- ${shellEscape(`${worker}.${id}`)} ${shellEscape(worker)}`);
    await sandbox.writeFile(
      request,
      JSON.stringify({ input, rename }),
      "utf-8",
    );
    await run(
      `node --max-old-space-size=512 ${[worker, sandbox.workingDirectory, runtime, request, output].map(shellEscape).join(" ")}`,
    );
    const result = intelligenceResultSchema.parse(
      JSON.parse(await sandbox.readFile(output, "utf-8")),
    );
    if (saved && result.success) {
      await sandbox.writeFile(
        `${saved}.${id}`,
        JSON.stringify({ digest, result }),
        "utf-8",
      );
      await run(`mv -- ${shellEscape(`${saved}.${id}`)} ${shellEscape(saved)}`);
    }
    return result;
  } finally {
    await sandbox
      .exec(
        `rm -f -- ${shellEscape(request)} ${shellEscape(output)}`,
        sandbox.workingDirectory,
        10_000,
      )
      .catch(() => {});
  }
}
