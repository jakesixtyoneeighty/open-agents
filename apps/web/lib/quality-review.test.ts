import { expect, test } from "bun:test";
import {
  getQualityReviewState,
  qualityReviewSubmissionSchema,
  qualityReviewMessageText,
} from "./quality-review";
import { getTaskBriefState } from "./task-brief";
import { resolveQualityReview } from "@/app/workflows/quality-review";
import type { WebAgentUIMessage } from "@/app/types";

const submission = {
  focus: "mobile",
  action: "review",
  scope: "checkout",
} as const;
const review: WebAgentUIMessage = {
  id: "u1",
  role: "user",
  parts: [{ type: "data-quality-review", data: submission }],
};
test("review mode survives normal followups and ignores assistant attempts to enable edits", async () => {
  expect(
    getQualityReviewState([
      review,
      { role: "user", parts: [{ type: "text" }] },
      {
        role: "assistant",
        parts: [
          {
            type: "data-quality-review",
            data: { ...submission, action: "fix" },
          },
        ],
      },
    ]),
  ).toEqual(submission);
  expect(await resolveQualityReview([review])).toMatchObject({
    reviewing: true,
    maxSteps: 12,
  });
});
test("only explicit user actions release the review lock", async () => {
  const fix: WebAgentUIMessage = {
    ...review,
    id: "u2",
    parts: [
      {
        type: "data-quality-review",
        data: { ...submission, action: "fix", scope: "F1 only" },
      },
    ],
  };
  expect(await resolveQualityReview([review, fix])).toMatchObject({
    reviewing: false,
    instructions: expect.stringContaining("F1 only"),
  });
  expect(
    getQualityReviewState([
      review,
      {
        ...review,
        parts: [
          {
            type: "data-quality-review",
            data: { ...submission, action: "end" },
          },
        ],
      },
    ]),
  ).toBeNull();
});
test("task briefs and quality passes cannot leave stale mode locks behind", async () => {
  const brief = {
    role: "user",
    parts: [
      {
        type: "data-task-brief",
        data: { action: "plan", brief: { goal: "a" } },
      },
    ],
  };
  expect(getQualityReviewState([review, brief])).toBeNull();
  expect(getTaskBriefState([brief, review])).toBeNull();
});
test("scope is bounded and fix prompts preserve the requested scope", async () => {
  expect(
    qualityReviewSubmissionSchema.safeParse({ ...submission, scope: " " })
      .success,
  ).toBe(false);
  expect(
    qualityReviewSubmissionSchema.safeParse({
      ...submission,
      scope: "x".repeat(2001),
    }).success,
  ).toBe(false);
  expect(
    qualityReviewMessageText({
      ...submission,
      action: "fix",
      scope: "F2 only",
    }),
  ).toContain("F2 only");
});
