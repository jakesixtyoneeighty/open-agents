import { describe, expect, test } from "bun:test";
import {
  buildRepoPreferencesPrompt,
  mergeRepoSkillRefs,
  resolveRepoModelId,
} from "./resolve";
import { repoPreferencesInputSchema } from "./schema";

describe("resolveRepoModelId", () => {
  test("prefers the repository model", () => {
    expect(resolveRepoModelId({ modelId: "openai/gpt-5" }, "default")).toBe(
      "openai/gpt-5",
    );
  });

  test("falls back to the user default", () => {
    expect(resolveRepoModelId({ modelId: null }, "default")).toBe("default");
    expect(resolveRepoModelId(null, "default")).toBe("default");
  });
});

describe("mergeRepoSkillRefs", () => {
  test("adds repository skills after user skills without duplicates", () => {
    const user = [{ source: "acme/skills", skillName: "review" }];
    const merged = mergeRepoSkillRefs(user, {
      skillRefs: [
        { source: "ACME/skills", skillName: "Review" },
        { source: "acme/skills", skillName: "deploy" },
      ],
    });
    expect(merged).toEqual([
      { source: "acme/skills", skillName: "review" },
      { source: "acme/skills", skillName: "deploy" },
    ]);
  });

  test("keeps user skills when there are no repository preferences", () => {
    const user = [{ source: "acme/skills", skillName: "review" }];
    expect(mergeRepoSkillRefs(user, null)).toEqual(user);
  });
});

describe("buildRepoPreferencesPrompt", () => {
  test("returns null when nothing applies", () => {
    expect(buildRepoPreferencesPrompt(null)).toBeNull();
    expect(
      buildRepoPreferencesPrompt({
        setupCommand: null,
        checkCommand: null,
        instructions: null,
      }),
    ).toBeNull();
  });

  test("includes instructions and the check command", () => {
    const prompt = buildRepoPreferencesPrompt({
      setupCommand: "pnpm install",
      checkCommand: "pnpm run ci",
      instructions: "Use tabs.",
    });
    expect(prompt).toContain("pnpm install");
    expect(prompt).toContain("Use tabs.");
    expect(prompt).toContain("pnpm run ci");
    expect(prompt?.indexOf("Use tabs.")).toBeLessThan(
      prompt?.indexOf("pnpm run ci") ?? 0,
    );
  });
});

describe("repoPreferencesInputSchema", () => {
  const base = {
    modelId: null,
    skillRefs: [],
    setupCommand: null,
    checkCommand: null,
    instructions: null,
  };

  test("stores blank text as null and trims values", () => {
    const parsed = repoPreferencesInputSchema.parse({
      ...base,
      modelId: "  ",
      setupCommand: "  pnpm install  ",
    });
    expect(parsed.modelId).toBeNull();
    expect(parsed.setupCommand).toBe("pnpm install");
  });

  test("rejects oversized fields and too many skills", () => {
    expect(
      repoPreferencesInputSchema.safeParse({
        ...base,
        instructions: "x".repeat(8001),
      }).success,
    ).toBe(false);
    expect(
      repoPreferencesInputSchema.safeParse({
        ...base,
        skillRefs: Array.from({ length: 21 }, (_, i) => ({
          source: "acme/skills",
          skillName: `s${i}`,
        })),
      }).success,
    ).toBe(false);
  });
});
