import { describe, expect, test } from "bun:test";
import {
  clearReviewedFiles,
  type DiffReviewStorage,
  findNextUnreviewedPath,
  getDiffFileFingerprint,
  isFileReviewed,
  readReviewedFiles,
  setFileReviewed,
  writeReviewedFiles,
} from "./diff-review-storage";

function createMemoryStorage(): DiffReviewStorage & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function file(path: string, diff = `patch for ${path}`) {
  return {
    path,
    status: "modified" as const,
    additions: 1,
    deletions: 0,
    diff,
  };
}

describe("diff review fingerprints", () => {
  test("changes when the patch changes", () => {
    expect(getDiffFileFingerprint(file("a.ts", "one"))).not.toBe(
      getDiffFileFingerprint(file("a.ts", "two")),
    );
  });

  test("distinguishes generated files by line counts", () => {
    const before = { ...file("lock.json", ""), additions: 10 };
    const after = { ...file("lock.json", ""), additions: 11 };
    expect(getDiffFileFingerprint(before)).not.toBe(
      getDiffFileFingerprint(after),
    );
  });
});

describe("reviewed marks", () => {
  test("an edit invalidates a reviewed file", () => {
    const original = file("a.ts", "v1");
    const reviewed = setFileReviewed({}, [original], original, true);
    expect(isFileReviewed(reviewed, original)).toBe(true);
    expect(isFileReviewed(reviewed, file("a.ts", "v2"))).toBe(false);
  });

  test("unmarking clears only that file", () => {
    const a = file("a.ts");
    const b = file("b.ts");
    let reviewed = setFileReviewed({}, [a, b], a, true);
    reviewed = setFileReviewed(reviewed, [a, b], b, true);
    reviewed = setFileReviewed(reviewed, [a, b], a, false);
    expect(isFileReviewed(reviewed, a)).toBe(false);
    expect(isFileReviewed(reviewed, b)).toBe(true);
  });

  test("drops marks for removed or since-edited files", () => {
    const a = file("a.ts", "v1");
    const b = file("b.ts");
    const c = file("c.ts");
    let reviewed = setFileReviewed({}, [a, b, c], a, true);
    reviewed = setFileReviewed(reviewed, [a, b, c], b, true);

    // b is no longer changed and a was edited.
    const editedA = file("a.ts", "v2");
    reviewed = setFileReviewed(reviewed, [editedA, c], c, true);
    expect(Object.keys(reviewed)).toEqual(["c.ts"]);
  });
});

describe("diff review storage", () => {
  test("round-trips marks per session", () => {
    const storage = createMemoryStorage();
    writeReviewedFiles(storage, "s1", { "a.ts": "x" });
    writeReviewedFiles(storage, "s2", { "b.ts": "y" });
    expect(readReviewedFiles(storage, "s1")).toEqual({ "a.ts": "x" });
    expect(readReviewedFiles(storage, "s2")).toEqual({ "b.ts": "y" });
  });

  test("removes the entry when nothing is reviewed", () => {
    const storage = createMemoryStorage();
    writeReviewedFiles(storage, "s1", { "a.ts": "x" });
    clearReviewedFiles(storage, "s1");
    expect(storage.data.size).toBe(0);
  });

  test("ignores malformed stored values", () => {
    const storage = createMemoryStorage();
    storage.setItem("open-agents:diff-review:s1", "not json");
    expect(readReviewedFiles(storage, "s1")).toEqual({});
    storage.setItem("open-agents:diff-review:s1", '{"a.ts": 3}');
    expect(readReviewedFiles(storage, "s1")).toEqual({});
    storage.setItem("open-agents:diff-review:s1", '["a.ts"]');
    expect(readReviewedFiles(storage, "s1")).toEqual({});
  });

  test("tolerates missing or throwing storage", () => {
    const throwing: DiffReviewStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readReviewedFiles(null, "s1")).toEqual({});
    expect(readReviewedFiles(throwing, "s1")).toEqual({});
    expect(() =>
      writeReviewedFiles(throwing, "s1", { "a.ts": "x" }),
    ).not.toThrow();
  });
});

describe("findNextUnreviewedPath", () => {
  const paths = ["a", "b", "c", "d"];

  test("starts at the top without a current file", () => {
    expect(findNextUnreviewedPath(paths, new Set(["a"]), null)).toBe("b");
  });

  test("moves forward from the current file and wraps", () => {
    const reviewed = new Set(["b", "d"]);
    expect(findNextUnreviewedPath(paths, reviewed, "a")).toBe("c");
    expect(findNextUnreviewedPath(paths, reviewed, "c")).toBe("a");
  });

  test("can land back on the current file when it is the only one left", () => {
    expect(findNextUnreviewedPath(paths, new Set(["a", "b", "d"]), "c")).toBe(
      "c",
    );
  });

  test("returns null when everything is reviewed", () => {
    expect(findNextUnreviewedPath(paths, new Set(paths), "a")).toBeNull();
    expect(findNextUnreviewedPath([], new Set(), null)).toBeNull();
  });
});
