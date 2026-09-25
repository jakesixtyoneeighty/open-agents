import { describe, expect, test } from "bun:test";
import {
  getTaskBriefState,
  taskBriefSchema,
  taskBriefSubmissionSchema,
} from "./task-brief";

const brief = taskBriefSchema.parse({ goal: "Build a booking form" });
const snapshot = (action: "plan" | "build", role = "user") => ({
  role,
  parts: [{ type: "data-task-brief", data: { brief, action } }],
});

describe("task brief state", () => {
  test("requires a real goal, limits fields, and rejects unknown properties", () => {
    expect(taskBriefSchema.safeParse({ goal: "  " }).success).toBe(false);
    expect(
      taskBriefSchema.safeParse({ goal: "x", references: "a".repeat(3001) })
        .success,
    ).toBe(false);
    expect(taskBriefSchema.safeParse({ goal: "x", extra: true }).success).toBe(
      false,
    );
    expect(
      taskBriefSubmissionSchema.safeParse({ brief, action: "deploy" }).success,
    ).toBe(false);
    expect(brief.audience).toBe("");
  });

  test("keeps planning active through questions and ordinary follow-ups", () => {
    expect(
      getTaskBriefState([
        snapshot("plan"),
        { role: "assistant", parts: [{ type: "tool-ask_user_question" }] },
        { role: "user", parts: [{ type: "text" }] },
      ])?.action,
    ).toBe("plan");
  });

  test("only an explicit user build snapshot enables implementation", () => {
    expect(
      getTaskBriefState([snapshot("plan"), snapshot("build", "assistant")])
        ?.action,
    ).toBe("plan");
    expect(
      getTaskBriefState([snapshot("plan"), snapshot("build")])?.action,
    ).toBe("build");
    expect(
      getTaskBriefState([snapshot("plan"), snapshot("build"), snapshot("plan")])
        ?.action,
    ).toBe("plan");
  });

  test("reloading or forking a transcript derives the same latest brief", () => {
    const messages = [snapshot("plan"), snapshot("build")];
    expect(getTaskBriefState(structuredClone(messages))).toEqual({
      brief,
      action: "build",
    });
    expect(getTaskBriefState(messages.slice(0, 1))?.action).toBe("plan");
    expect(getTaskBriefState([])).toBeNull();
  });
});
