import { describe, expect, test } from "bun:test";
import { parseRepoCoordinates } from "./parse-repo";

describe("parseRepoCoordinates", () => {
  test("parses owner/repo and GitHub URLs", () => {
    const expected = { repoOwner: "vercel", repoName: "next.js" };
    expect(parseRepoCoordinates("Vercel/next.js")).toEqual(expected);
    expect(parseRepoCoordinates("https://github.com/vercel/next.js")).toEqual(
      expected,
    );
    expect(parseRepoCoordinates("github.com/vercel/next.js.git/")).toEqual(
      expected,
    );
  });

  test("rejects anything that is not exactly one owner and repo", () => {
    expect(parseRepoCoordinates("vercel")).toBeNull();
    expect(parseRepoCoordinates("vercel/next.js/tree/main")).toBeNull();
    expect(parseRepoCoordinates("../etc")).toBeNull();
    expect(parseRepoCoordinates("owner/re po")).toBeNull();
    expect(parseRepoCoordinates("")).toBeNull();
  });
});
