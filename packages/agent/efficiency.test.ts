import { expect, test } from "bun:test";
import type { LanguageModelUsage } from "ai";
import { addEfficiency, gatewayCost, measureEfficiency } from "./efficiency";

test("missing usage and cost stay unknown, including partially reported totals", () => {
  const known = measureEfficiency(
    {
      inputTokens: 100,
      outputTokens: 20,
      inputTokenDetails: { cacheReadTokens: 80, cacheWriteTokens: 0 },
      outputTokenDetails: { reasoningTokens: 10 },
    } as LanguageModelUsage,
    0.01,
    1000,
  );
  expect(known).toMatchObject({
    inputTokens: 100,
    cacheReadTokens: 80,
    cacheWriteTokens: 0,
    reasoningTokens: 10,
    costUsd: 0.01,
  });
  expect(addEfficiency(known, measureEfficiency(undefined))).toMatchObject({
    steps: 2,
    inputTokens: null,
    costUsd: null,
    durationMs: null,
  });
  expect(addEfficiency(known, known)).toMatchObject({
    steps: 2,
    inputTokens: 200,
    costUsd: 0.02,
  });
});

test("Gateway costs reject malformed, negative and unavailable values", () => {
  expect(gatewayCost({ gateway: { cost: "0.012" } })).toBe(0.012);
  expect(gatewayCost({ gateway: { cost: "0" } })).toBe(0);
  for (const cost of ["", "garbage", "1.2oops", -1, Infinity]) {
    expect(gatewayCost({ gateway: { cost } })).toBeUndefined();
  }
});
