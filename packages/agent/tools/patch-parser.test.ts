import { expect, test } from "bun:test";
import { parseWorkspacePatch } from "./patch-parser";
import { compactWorkspaceEditResult } from "./workspace-edit-schema";

test("parses add, context update, move and delete into one operation list", () => {
  const revision = "a".repeat(64);
  const operations = parseWorkspacePatch(
    "*** Begin Patch\n*** Add File: new.ts\n+new\n*** Update File: old.ts\n*** Move to: moved.ts\n@@\n context\n-old\n+changed\n*** End of File\n*** Delete File: removed.ts\n*** End Patch\n",
    { "old.ts": revision, "removed.ts": revision },
  );
  expect(operations).toEqual([
    { kind: "create", path: "new.ts", content: "new\n" },
    {
      kind: "update",
      path: "old.ts",
      moveTo: "moved.ts",
      expectedRevision: revision,
      hunks: [
        {
          before: ["context", "old"],
          after: ["context", "changed"],
          atEnd: true,
        },
      ],
    },
    { kind: "delete", path: "removed.ts", expectedRevision: revision },
  ]);
});

test("rejects malformed patches, missing revisions and invalid hunk lines", () => {
  for (const patch of [
    "not a patch",
    "*** Begin Patch\n*** Delete File: a\n*** End Patch",
    "*** Begin Patch\n*** Update File: a\n@@\ninvalid\n*** End Patch",
    "*** Begin Patch\n*** Update File: a\n@@\n unchanged\n*** End Patch",
  ])
    expect(() =>
      parseWorkspacePatch(
        patch,
        patch.includes("Delete") ? {} : { a: "a".repeat(64) },
      ),
    ).toThrow();
});

test("model projection retains revisions and undo identity without duplicating source", () => {
  const original = {
    success: true as const,
    changeSetId: "a".repeat(64),
    dryRun: false,
    replacements: 1,
    changes: [
      {
        path: "a",
        before: "original source",
        after: "new source",
        beforeRevision: "b".repeat(64),
        afterRevision: "c".repeat(64),
      },
    ],
  };
  const projected = compactWorkspaceEditResult(original);
  expect(JSON.stringify(projected)).not.toContain("original source");
  expect(JSON.stringify(projected)).not.toContain("new source");
  expect(projected).toHaveProperty("changeSetId", original.changeSetId);
  expect(original.changes[0]?.before).toBe("original source");
});
