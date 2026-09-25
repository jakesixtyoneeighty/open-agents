# User experience improvements

Approved sequence: begin with suggestion 2, then work down the review list. Implement and validate each increment before beginning the next. Suggestion 1 (readiness report) remains deferred, not silently included.

Deviation (2026-09-24): increment 3 was skipped because it needs an infrastructure decision (see below); increments 4 and 5 were implemented instead. Increment 3 should be revisited before 6.

| Order | Increment | Acceptance |
| --- | --- | --- |
| 2 | Task/design brief and planning skill — implemented locally | Optional editable brief; persisted submission history; read-only planning; explicit build action; reload and continuation support. CI and component browser checks passed; live authenticated acceptance remains pending. |
| 3 | Visual results gallery — blocked on storage decision | Label desktop/mobile captures by page and run; show errors; compare before/after only when both exist. Screenshots are currently stripped from persisted subagent output (`packages/agent/tools/task.ts`), so a gallery first needs durable image storage (e.g. Blob) and a retention decision. |
| 4 | Saved message drafts — implemented locally | Restore text to its originating chat after navigation/refresh; clear only after accepted submission. Per-chat localStorage draft (`lib/chat-draft-storage.ts`, `hooks/use-chat-draft.ts`); held until status reaches streaming/ready, restored to the composer on error. Unit + fixture browser checks passed; live authenticated acceptance pending. |
| 5 | Separate closing from deleting — implemented locally | Closed tabs remain in history; permanent deletion stays explicit. `chats.closed_at` column (migration 0037); tab X closes, closed chats menu reopens or deletes with confirmation. Route + fixture browser checks passed; live authenticated acceptance pending. |
| 6 | Accurate outcome alerts | Completed, stopped, failed, and needs-input states derive from authoritative outcomes. |
| 7 | Focused quality passes | Bounded mobile/accessibility/code review produces findings before requested fixes. |
| 8 | Diff review progress | Reviewed files and next-unreviewed navigation; edits invalidate reviewed status. |
| 9 | Repository preferences | Owner-scoped model, skills, startup/check commands and instructions reused across sessions. |
| 10 | Preview beside chat | Responsive widths, refresh and external fallback; preserve browser origin isolation. |

Each increment must preserve session ownership checks, durable state, truthful verification claims, and existing in-progress work. Publishing/deployment is a separate step. No production changes are authorized by this roadmap alone.

## Implementation notes

### 3. Visual results gallery — blocked

- `packages/agent/tools/screenshot.ts` captures images inside the design subagent, but `stripToolResultImages` in `packages/agent/tools/task.ts` replaces them with `[image omitted]` before the parent tool output is persisted. The capture only exists in the sandbox (`~/.open-agents/browser/shots/<toolCallId>.jpg`), which may be stopped later.
- Decisions needed before building: where images are stored durably (e.g. Vercel Blob, private), retention/cleanup, and whether shared conversations expose them.

### 4. Saved message drafts — implemented locally

**Behavior**
- Composer text is saved per chat in the viewer's browser (`localStorage`, key `open-agents:chat-draft:<chatId>`) and restored after navigation or refresh. Only text is saved; image and text attachments are not.
- On submit the stored draft is held (not cleared) until the chat status shows the server accepted the request (`streaming`, or `ready` after having been in flight). If the send ends in `error` or throws, the text is restored to the composer (previously it was lost).
- An `error` status left over from a previous turn is ignored until the new request is seen in flight.
- Persistence pauses while the textarea is answering an inline question. Switching chats never carries text across. Permanently deleting a chat clears its draft.

**Changes**
- `apps/web/lib/chat-draft-storage.ts` (+ `.test.ts`): storage helpers that tolerate missing or throwing storage, and `resolveDraftSubmission` (pending/accepted/failed).
- `apps/web/app/sessions/[sessionId]/chats/[chatId]/hooks/use-chat-draft.ts`: restore, persist, hold and restore-on-failure logic.
- `session-chat-content.tsx`: mounts the hook; the submit handler holds the draft before clearing and restores it on thrown errors.
- `chat-tabs.tsx`: clears the draft on permanent delete.

### 5. Separate closing from deleting — implemented locally

**Behavior**
- The tab ✕ closes a chat without confirmation; the chat and its messages are kept. The last open chat cannot be closed (enforced client- and server-side).
- A "Closed chats" menu (history icon + count) beside the tab bar lists closed chats, most recently closed first. Selecting one reopens and switches to it; the trash item opens a confirmation dialog for permanent deletion.
- Closing does not bump `updatedAt`, so chat ordering reflects real activity only.
- A closed chat opened directly by URL still shows its tab. `/sessions/[id]` redirects to the most recent open chat.

**Changes**
- `apps/web/lib/db/schema.ts`: nullable `chats.closed_at`; migration `lib/db/migrations/0037_sharp_toro.sql` (`ALTER TABLE "chats" ADD COLUMN "closed_at" timestamp`). No backfill needed; existing chats stay open.
- `apps/web/lib/db/sessions.ts`: `setChatClosed(chatId, closed)`; `closedAt` included in chat summaries.
- `apps/web/app/api/sessions/[sessionId]/chats/[chatId]/route.ts`: `PATCH { closed: boolean }` with ownership checks and the last-open-chat guard (+ route tests for close, reopen and refusal).
- `apps/web/hooks/use-session-chats.ts`: optimistic `closeChat` / `reopenChat` with rollback on failure; exposed through `session-layout-context.tsx` and `session-layout-shell.tsx`.
- `chat-tabs.tsx` and new `closed-chats-menu.tsx`: close/reopen/delete UI; the delete dialog now says "Delete chat permanently?" and points to closing as the non-destructive option.
- `apps/web/app/sessions/[sessionId]/page.tsx`: prefers an open chat when redirecting.

### Validation evidence (increments 4 and 5)

- `pnpm run ci` passed: formatting, lint, type checks, all isolated tests, and migration consistency. Bun was not installed locally; tests ran with Bun 1.4.2 via `pnpm dlx bun`.
- There was no local `.env.local` (no database or auth), so the real components were browser-tested in a temporary fixture page, which was then deleted:
  - Drafts: kept per chat across switches and a full reload; a failed send restored the text; a successful send cleared storage only after acceptance, including when starting from a leftover `error` status.
  - Close/delete: closing (including the active tab) switched to another open chat with no dialog; the last tab had no close button; reopen and confirmed delete worked; the page stayed clickable after the dialog; no horizontal overflow at 390px.
  - The fixture caught one bug, which was fixed: the trash icon nested inside a menu item reopened the chat, because Radix selects items on pointer-up. Each row is now two sibling menu items.
- Not yet exercised: live authenticated use against a real database, applying migration 0037 in a preview deployment, and multi-tab/multi-device draft behavior (drafts are per browser by design).
