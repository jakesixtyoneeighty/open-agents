import { describe, expect, mock, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSkillFrontmatter } from "@open-agents/agent";

mock.module("server-only", () => ({}));

const { loadTaskPlanningSkill } = await import("./task-planning");
const appDirectory = fileURLToPath(new URL("../../", import.meta.url));
const repositoryDirectory = path.resolve(appDirectory, "../..");

describe("bundled task planning skill", () => {
  test("loads the canonical skill from app and repository working directories", async () => {
    const fromApp = await loadTaskPlanningSkill(appDirectory);
    const fromRepository = await loadTaskPlanningSkill(repositoryDirectory);

    expect(fromApp).toBe(fromRepository);
    expect(fromApp).toStartWith("# Task and design planning");
    expect(fromApp).toContain("Build this plan");
    expect(fromApp).toContain("Do not edit or create files");
    expect(fromApp).not.toContain("description:");
  });

  test("keeps valid discoverable metadata in the authored SKILL.md", async () => {
    const content = await readFile(
      path.join(appDirectory, "lib/skills/task-planning/SKILL.md"),
      "utf-8",
    );
    const parsed = parseSkillFrontmatter(content);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("task-planning");
    }
  });

  test("fails closed when the bundled skill is unavailable", async () => {
    await expect(
      loadTaskPlanningSkill(path.join(appDirectory, "missing-skill-root")),
    ).rejects.toThrow("The bundled task planning skill could not be loaded.");
  });
});
