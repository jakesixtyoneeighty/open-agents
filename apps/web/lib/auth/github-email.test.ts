import { describe, expect, test } from "bun:test";
import { resolveGitHubEmail } from "./github-email";

describe("resolveGitHubEmail", () => {
  test("keeps the email GitHub returned", () => {
    expect(
      resolveGitHubEmail({ id: 42, login: "octocat", email: "o@example.com" }),
    ).toBe("o@example.com");
  });

  test("falls back to the noreply address when GitHub returns none", () => {
    expect(resolveGitHubEmail({ id: 42, login: "octocat", email: null })).toBe(
      "42+octocat@users.noreply.github.com",
    );
  });
});
