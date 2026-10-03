import { expect, mock, test } from "bun:test";
import { MockLanguageModelV3 } from "ai/test";
import { getBundledSkills, withBundledSkills } from "./bundled";
import { skillTool } from "../tools/skill";
import type { SkillMetadata } from "./types";

function createModel(skill?: string) {
  let step = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content:
        skill && step++ === 0
          ? [
              {
                type: "tool-call" as const,
                toolCallId: "load-skill",
                toolName: "skill",
                input: JSON.stringify({ skill }),
              },
            ]
          : [
              {
                type: "text" as const,
                text: "Finished inspecting the instructions.",
              },
            ],
      finishReason: {
        unified:
          skill && step === 1 ? ("tool-calls" as const) : ("stop" as const),
        raw: undefined,
      },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 5, text: 5, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}

let mainModel = createModel();
mock.module("../models", () => ({ gateway: () => mainModel }));
const { createOpenAgent } = await import("../open-agent");
const { explorerSubagent } = await import("../subagents/explorer");
const { executorSubagent } = await import("../subagents/executor");
const { designSubagent } = await import("../subagents/design");

const sandbox = {
  state: { type: "vercel" as const, sandboxId: "not-a-real-sandbox" },
  workingDirectory: "/repo",
};

test("main app agent advertises and loads bundled skills without sandbox installation", async () => {
  mainModel = createModel("diagnosing-bugs");
  const result = await createOpenAgent().generate({
    prompt: "Investigate a regression",
    options: { sandbox, skills: [] },
  });
  const request = JSON.stringify(mainModel.doGenerateCalls[0]?.prompt);
  expect(request).toContain("Skills in the workflow");
  expect(request).toContain("load diagnosing-bugs before investigating");
  expect(request).not.toContain("Minimize the reproduction");
  expect(JSON.stringify(result.toolResults)).toContain(
    "Minimize the reproduction",
  );
  expect(JSON.stringify(result.toolResults)).toContain('"success":true');
});

test("planning and quality review never advertise or enable the bundled skill tool", async () => {
  for (const mode of [{ planningMode: true }, { qualityReviewMode: true }]) {
    mainModel = createModel();
    await createOpenAgent().generate({
      prompt: "Inspect only",
      options: { sandbox, skills: getBundledSkills(), ...mode },
    });
    const request = mainModel.doGenerateCalls[0];
    expect(JSON.stringify(request?.prompt)).not.toContain(
      "Skills in the workflow",
    );
    expect(request?.tools?.some((tool) => tool.name === "skill")).toBe(false);
    expect(request?.tools?.some((tool) => tool.name === "task")).toBe(false);
    expect(request?.tools?.some((tool) => tool.name === "write")).toBe(false);
  }
});

test("children can load their role's skills through the actual SDK loop", async () => {
  for (const [agent, skill] of [
    [explorerSubagent, "research"],
    [executorSubagent, "tdd"],
    [designSubagent, "vercel-composition-patterns"],
  ] as const) {
    const model = createModel(skill);
    const result = await agent.generate({
      prompt: "Use the relevant guidance",
      options: {
        task: "Inspect skills",
        instructions: "Load relevant skill",
        sandbox,
        model,
        skills: getBundledSkills(),
      },
    });
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain(
      "App-bundled instructions",
    );
    expect(JSON.stringify(result.steps[0]?.toolResults)).toContain(
      '"success":true',
    );
    const initial = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    if (skill === "research") {
      expect(initial).not.toContain("- tdd:");
      expect(
        model.doGenerateCalls[0]?.tools?.some((tool) => tool.name === "write"),
      ).toBe(false);
    }
    if (skill === "vercel-composition-patterns")
      expect(initial).toContain("Frontend Art Direction");
  }
});

test("project overrides are case-insensitive, keep discovery order, and can disable a default", async () => {
  const project: SkillMetadata = {
    name: "TDD",
    description: "Project-specific testing",
    path: "/repo/.agents/skills/tdd",
    filename: "SKILL.md",
    options: { disableModelInvocation: true },
  };
  const catalog = withBundledSkills([
    project,
    { ...project, description: "Global duplicate" },
  ]);
  expect(catalog.filter((skill) => skill.name.toLowerCase() === "tdd")).toEqual(
    [project],
  );
  expect(catalog).toHaveLength(6);
  const result = await skillTool.execute?.(
    { skill: "tdd" },
    {
      toolCallId: "disabled",
      messages: [],
      experimental_context: { skills: catalog },
    },
  );
  expect(result).toMatchObject({ success: false });
});

test("bundled loading is limited to registered skills and returns current content", async () => {
  const catalog = withBundledSkills(
    getBundledSkills().map((skill) => ({
      ...skill,
      description: "Old catalog",
    })),
  );
  expect(catalog.every((skill) => skill.description !== "Old catalog")).toBe(
    true,
  );
  for (const skill of catalog) {
    const result = await skillTool.execute?.(
      { skill: skill.name.toUpperCase() },
      {
        toolCallId: skill.name,
        messages: [],
        experimental_context: { skills: catalog },
      },
    );
    expect(result).toMatchObject({ success: true });
  }
  const result = await skillTool.execute?.(
    { skill: "tdd" },
    {
      toolCallId: "missing",
      messages: [],
      experimental_context: { skills: withBundledSkills([], "explorer") },
    },
  );
  expect(result).toMatchObject({ success: false });
});
