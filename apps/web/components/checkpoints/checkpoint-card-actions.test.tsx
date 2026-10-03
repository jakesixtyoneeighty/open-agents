import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SWRConfig } from "swr";
import { checkpointHistoryKey } from "@/lib/checkpoints/api";
import type {
  CheckpointEntry,
  CheckpointListResponse,
  CheckpointRestoreResponse,
} from "@/lib/checkpoints/types";
import { CheckpointCardActions } from "./checkpoint-card-actions";
import { CheckpointRestoreProvider } from "./checkpoint-restore-context";
import {
  expectedRevisionsFrom,
  summarizeRestorePreview,
} from "./use-restore-preview";

const changeSetId = "a".repeat(64);
const entry: CheckpointEntry = {
  changeSetId,
  committedAt: 1,
  status: "active",
  files: [{ path: "a.ts", kind: "updated", additions: 1, deletions: 1 }],
  source: "agent",
  toolName: "edit",
  chat: null,
  viaTask: false,
};

function render(
  entries: CheckpointEntry[] | null,
  historyAvailable = true,
): string {
  const history: CheckpointListResponse | undefined = entries
    ? {
        entries,
        retention: {
          maxEntries: 200,
          maxBytes: 1,
          entries: entries.length,
          bytes: 0,
          pruned: 0,
        },
        recoveryRequired: [],
      }
    : undefined;
  return renderToStaticMarkup(
    <SWRConfig
      value={{
        provider: () => new Map(),
        fallback: history
          ? { [checkpointHistoryKey("session-1")]: history }
          : {},
      }}
    >
      <CheckpointRestoreProvider
        sessionId="session-1"
        historyAvailable={historyAvailable}
        onRestored={async () => {}}
      >
        <CheckpointCardActions changeSetId={changeSetId} />
      </CheckpointRestoreProvider>
    </SWRConfig>,
  );
}

describe("edit card restore actions", () => {
  test("shared transcripts without a session provider render the fallback only", () => {
    const html = renderToStaticMarkup(
      <CheckpointCardActions
        changeSetId={changeSetId}
        fallback={<span>fallback</span>}
      />,
    );
    expect(html).toBe("<span>fallback</span>");
  });

  test("an available change offers revert and checkpoint restore", () => {
    const html = render([entry]);
    expect(html).toContain("Available in History");
    expect(html).toContain("Revert…");
    expect(html).toContain("Restore to before…");
  });

  test("a reverted change cannot be reverted again", () => {
    const html = render([{ ...entry, status: "reverted" }]);
    expect(html).toContain("Reverted");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Revert…/);
  });

  test("a change missing from cached history is rechecked, and paused sandboxes say why", () => {
    // The cached list can predate the edit, so it is never reported as gone
    // before a fresh history read.
    expect(render([])).toContain("Checking change history");
    expect(render([])).not.toContain("Revert…");
    expect(render([], false)).toContain("sandbox is paused");
    expect(render([], false)).not.toContain("Revert…");
  });
});

describe("restore preview summary", () => {
  const preview: CheckpointRestoreResponse = {
    changeSetId: "b".repeat(64),
    dryRun: true,
    replayed: false,
    reverts: [changeSetId],
    changes: [
      {
        path: "a.ts",
        before: "x",
        after: "y",
        beforeRevision: "r1",
        afterRevision: "r2",
        revertStatus: "merged",
      },
      {
        path: "gone.ts",
        before: null,
        after: "z",
        beforeRevision: null,
        afterRevision: "r3",
        revertStatus: "exact",
      },
      {
        path: "same.ts",
        before: "s",
        after: "s",
        beforeRevision: "r4",
        afterRevision: "r4",
        revertStatus: "unchanged",
      },
    ],
  };

  test("apply carries every previewed revision, including absent files", () => {
    expect(expectedRevisionsFrom(preview)).toEqual({
      "a.ts": "r1",
      "gone.ts": null,
      "same.ts": "r4",
    });
  });

  test("conflicts or no-op previews cannot be applied", () => {
    expect(summarizeRestorePreview(preview)).toEqual({
      changing: 2,
      merged: 1,
      unchanged: 1,
      conflicts: 0,
      canApply: true,
    });
    const conflicted = {
      ...preview,
      changes: [
        ...preview.changes,
        {
          path: "c.ts",
          before: "c",
          after: "c",
          beforeRevision: "r5",
          afterRevision: "r5",
          revertStatus: "conflict" as const,
          reason: "The changed lines were edited again afterwards.",
        },
      ],
    };
    expect(summarizeRestorePreview(conflicted).canApply).toBe(false);
    expect(
      summarizeRestorePreview({ ...preview, changes: [preview.changes[2]!] })
        .canApply,
    ).toBe(false);
  });
});
