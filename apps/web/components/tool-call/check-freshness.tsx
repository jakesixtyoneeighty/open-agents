"use client";

import { isToolUIPart } from "ai";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { WebAgentUIMessage } from "@/app/types";

/**
 * "stale": a later edit tool changed files. "maybe_stale": a later shell
 * command or delegated task could have. Revisions in the tool output remain
 * authoritative; this only keeps old passes from reading as current.
 */
export type CheckFreshness = "current" | "stale" | "maybe_stale";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mutationOf(part: WebAgentUIMessage["parts"][number]) {
  if (!isToolUIPart(part) || part.state !== "output-available") return null;
  const output: unknown = part.output;
  switch (part.type) {
    case "tool-write":
    case "tool-edit":
      return isRecord(output) && output.success === false ? null : "stale";
    case "tool-multi_edit":
    case "tool-apply_patch":
    case "tool-code_rename":
    case "tool-undo_edit":
      return isRecord(output) &&
        output.success === true &&
        output.dryRun !== true
        ? "stale"
        : null;
    case "tool-run_checks":
      return isRecord(output) &&
        Array.isArray(output.checks) &&
        output.checks.some(
          (check) => isRecord(check) && check.revisionChanged === true,
        )
        ? "stale"
        : null;
    case "tool-process":
    case "tool-bash":
      return "maybe_stale";
    case "tool-task": {
      const input: unknown = part.input;
      return isRecord(input) && input.subagentType === "explorer"
        ? null
        : "maybe_stale";
    }
    default:
      return null;
  }
}

/** Freshness of check and language observations, judged by later tool calls. */
export function computeCheckFreshness(messages: WebAgentUIMessage[]) {
  const parts = messages.flatMap((message) =>
    message.role === "assistant" ? message.parts : [],
  );
  const freshness = new Map<string, CheckFreshness>();
  let later: CheckFreshness = "current";
  for (let index = parts.length - 1; index >= 0; index--) {
    const part = parts[index];
    if (!part) continue;
    if (
      isToolUIPart(part) &&
      (part.type === "tool-run_checks" || part.type === "tool-code_inspect") &&
      part.state === "output-available"
    ) {
      freshness.set(part.toolCallId, later);
    }
    const mutation = mutationOf(part);
    if (
      mutation === "stale" ||
      (mutation === "maybe_stale" && later === "current")
    ) {
      later = mutation;
    }
  }
  return freshness;
}

const CheckFreshnessContext = createContext<Map<string, CheckFreshness> | null>(
  null,
);

export function CheckFreshnessProvider({
  messages,
  children,
}: {
  messages: WebAgentUIMessage[];
  children: ReactNode;
}) {
  const freshness = useMemo(() => computeCheckFreshness(messages), [messages]);
  return (
    <CheckFreshnessContext.Provider value={freshness}>
      {children}
    </CheckFreshnessContext.Provider>
  );
}

export function useCheckFreshness(toolCallId: string): CheckFreshness {
  return useContext(CheckFreshnessContext)?.get(toolCallId) ?? "current";
}
