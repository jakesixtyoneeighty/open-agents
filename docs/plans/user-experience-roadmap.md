# User experience improvements

Approved sequence: begin with suggestion 2, then work down the review list. Implement and validate each increment before beginning the next. Suggestion 1 (readiness report) remains deferred, not silently included.

Deviation (2026-09-24): increment 3 was skipped because it needs an infrastructure decision (see below); increments 4 and 5 were implemented instead. Increment 3 was revisited the same day once private Blob was live in production, and is now implemented locally.

| Order | Increment | Acceptance |
| --- | --- | --- |
| 2 | Task/design brief and planning skill — implemented locally | Optional editable brief; persisted submission history; read-only planning; explicit build action; reload and continuation support. CI and component browser checks passed; live authenticated acceptance remains pending. |
| 3 | Visual results gallery — implemented locally | Label desktop/mobile captures by page and run; show errors; compare before/after only when both exist. Captures go to private Vercel Blob and are listed on the task output; owner- and share-scoped image routes; cleanup on chat/session delete. Unit + fixture browser checks passed; live authenticated acceptance pending. |
| 4 | Saved message drafts — implemented locally | Restore text to its originating chat after navigation/refresh; clear only after accepted submission. Per-chat localStorage draft (`lib/chat-draft-storage.ts`, `hooks/use-chat-draft.ts`); held until status reaches streaming/ready, restored to the composer on error. Unit + fixture browser checks passed; live authenticated acceptance pending. |
| 5 | Separate closing from deleting — implemented locally | Closed tabs remain in history; permanent deletion stays explicit. `chats.closed_at` column (migration 0037); tab X closes, closed chats menu reopens or deletes with confirmation. Route + fixture browser checks passed; live authenticated acceptance pending. |
| 6 | Accurate outcome alerts — implemented locally | Completed, stopped, failed, and needs-input states derive from authoritative outcomes. |
| 7 | Focused quality passes — implemented locally | Bounded mobile/accessibility/code review produces findings before requested fixes. |
| 8 | Diff review progress — implemented locally | Reviewed files and next-unreviewed navigation; edits invalidate reviewed status. Per-session localStorage marks fingerprinted on each file's patch against base (`lib/diff-review-storage.ts`, `hooks/use-diff-review.ts`); "Viewed" toggle, `n/m viewed` count and next-unreviewed button in the diff tab, checkmarks in the git panel. Unit tests and CI passed; browser check and live authenticated acceptance pending. |
| 9 | Repository preferences — implemented locally | Owner-scoped model, skills, startup/check commands and instructions reused across sessions. `repo_preferences` table (migration 0039), Settings → Repositories, applied at session/chat creation, provisioning and every agent turn. Route, workflow and unit tests plus CI passed; browser check and live authenticated acceptance pending. |
| 10 | Preview beside chat — implemented locally | Responsive widths, refresh and external fallback; preserve browser origin isolation. `preview-pane.tsx` + `hooks/use-preview-pane.ts`; the frame only loads an https URL on an origin other than the app's (`lib/preview/preview-frame.ts`). Unit tests and CI passed; browser check and live authenticated acceptance pending. |

Each increment must preserve session ownership checks, durable state, truthful verification claims, and existing in-progress work. Publishing/deployment is a separate step. No production changes are authorized by this roadmap alone.

## Implementation notes

### 3. Visual results gallery — implemented locally

**Decisions**
- Storage: private Vercel Blob (already live in production). Enabled when `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` is set; without either, galleries still list captures and errors but keep no images.
- Retention: images live as long as what references them. Deleting a session removes its whole prefix; permanently deleting a chat removes only images no other chat in the session references (forks copy messages within a session). Deleting individual messages leaves images until the session is deleted. No TTL job.
- Sharing: shared pages show images through a share-scoped route that serves only images referenced by that shared chat.

**Behavior**
- Each design-subagent run shows a "Screenshots" panel under the task row (visible without expanding), grouped by page, then desktop → tablet → mobile, light before dark. Thumbnails show the latest capture. Failed captures, HTTP ≥ 400, console errors, and images that were not saved are flagged.
- Clicking a thumbnail opens the capture with its history. "Before / after" appears only when the same page, viewport, and color scheme has two or more stored images in that run (earliest versus latest).
- The panel updates while the subagent is still running.

**Changes**
- `packages/agent/tools/screenshot-store.ts`: `ScreenshotStore` host interface and `TaskScreenshot` schema. The agent package stays storage-agnostic.
- `packages/agent/tools/screenshot.ts`: hands each capture to the store (a storage failure is reported, not fatal) and returns `imageId`.
- `packages/agent/tools/task.ts` + `task-screenshots.ts`: collect screenshot results from the subagent stream into `output.screenshots` (no base64). The store is passed through the call options → design subagent context.
- `apps/web/app/workflows/chat.ts`: attaches `createScreenshotStore(sessionId)` inside `runAgentStep`, so it is never serialized into workflow state.
- `apps/web/lib/screenshots/`: Blob storage (`screenshots/<sessionId>/<imageId>.jpg`), id validation and reference scanning, cleanup, and the streaming response.
- Routes: `GET /api/sessions/[sessionId]/screenshots/[imageId]` (owner), `GET /api/shared/[shareId]/screenshots/[imageId]` (share-scoped); cleanup hooked into the session and chat `DELETE` handlers via `after`.
- `apps/web/components/tool-call/screenshot-gallery/`: grouping logic (+ tests), gallery/dialog UI, and `ScreenshotSourceProvider` (mounted in the session chat and shared chat views).

**Validation evidence**
- `pnpm run ci` passed (format, lint, types, all isolated tests, migration check). New tests: grouping/issues, image-id validation and reference collection, subagent result conversion, and chat-delete cleanup scheduling.
- Fixture page with a stub image route (both deleted afterwards): grouping, failed/HTTP/console/unsaved flags, before/after, failed-capture dialog, no horizontal overflow at 390px, clean hydration. The fixture caught one bug, which was fixed: an image that failed to load before hydration showed broken alt text, because `onError` had not attached yet.
- Not yet exercised: a real design-subagent run uploading to the production Blob store, the owner and shared routes against real auth/DB, and delete cleanup against Blob.

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


### 6. Accurate outcome alerts — implemented locally

- `chats.last_outcome` (migration 0038) records run ID, chat ID, status and completion time. Outcome persistence and releasing the active run share a compare-and-set update; stale runs cannot replace a newer run's outcome.
- Completed, stopped, failed and needs-input alerts use persisted outcomes. Stream disappearance alone emits nothing. Abnormal provider endings and step exhaustion are failures; pending user tool interactions need input. Stop writes its outcome after cancellation succeeds. Resume cleanup uses compare-and-set and records confirmed failed/cancelled runs without guessing success from transport completion.
- Alerts deduplicate by run ID, skip historical outcomes at mount and the currently active session, and navigate to the actual outcome's chat. They can detect short runs between polls and completion in one chat while another still runs. The latest outcome per chat is retained, not a full notification history.
- Validation: full CI passed before starting increment 7; tests cover classification, stop/stream routes, workflow outcomes, and notification deduplication. Additional CAS tests cover the atomic update and stale-run refusal. Browser fixtures verified all four alert labels, the destination chat, and no alert on stream disappearance alone.
- Pending: migration application and live authenticated workflow/notification acceptance. No deployment performed.

### 7. Focused quality passes — implemented locally

- A Quality pass control offers mobile, accessibility and code focus with a required, bounded scope. Reviews run on the existing agent; no separate agent or delegation tool is introduced.
- Structured user snapshots keep review mode across follow-ups/reloads and are preserved through resend, model conversion, shared transcript and Markdown export. Starting a brief or quality pass replaces the previous mode.
- Reviews allow source-reading tools and screenshots of available previews; project edits, shell, delegation, executable skills and Git automation are unavailable. The workflow enforces a maximum of 12 model steps. Instructions limit scope to 10 files, 2 pages, 4 captures and 5 evidence-backed findings; these counts are prompt limits, not separate tool counters.
- Reports identify findings, inspected scope and unverified areas. Source-only checks must be labelled when no live preview is available. Exhaustion reports a partial review rather than success.
- Request fixes requires a completed response and explicit fix scope; End review returns to ordinary chat. Failed submissions retain an exact retry request.
- Validation: full CI and fixture browser checks (real controls with stubbed responses) cover review → findings → scoped fixes, failed send/retry, end review, mobile dialog at 390px without overflow, and no browser console errors. Unit/workflow tests cover API validation, mode persistence, the fail-closed tool allowlist, no Git automation, and the enforced step cap.
- Pending: live authenticated model review, real preview screenshots, and fixes against a sandbox. No deployment performed.

Integration: increments 8–10 were built on a separate branch and merged with 6 and 7 on `ux-roadmap-6-10`. Migrations were renumbered so 0038 is `chats.last_outcome` and 0039 is `repo_preferences`, and full CI passed on the combined tree.

### 8. Diff review progress — implemented locally

**Behavior**
- Each file header in the diff tab has a "Viewed" toggle. Marking a file viewed collapses it and keeps its header in view. The toolbar shows `n/m viewed` for the current scope, plus a "Next unreviewed file" button that expands and scrolls to the next unviewed file after the one you last worked on, wrapping around. It is disabled when every file is viewed.
- A mark stores a fingerprint of the file's patch against the base branch (plus status, line counts and old path, which stand in for generated files that have no patch). Any later edit changes the fingerprint, so the file shows as unviewed again. A revert to the reviewed content shows as viewed again. Committing leaves the patch against the base unchanged, so marks survive commits, and they are shared between the uncommitted and branch scopes.
- The git panel's file list shows a checkmark and muted name for viewed files. Both views read the same store, so they stay in sync (other browser tabs sync through the `storage` event).
- Marks are per browser, keyed `open-agents:diff-review:<sessionId>`. Marks for files that are no longer changed, or that were edited since, are pruned on the next write.

**Changes**
- `apps/web/lib/diff-review-storage.ts` (+ `.test.ts`): fingerprinting, tolerant storage read/write, mark set/clear with pruning, and `findNextUnreviewedPath`.
- `apps/web/app/sessions/[sessionId]/chats/[chatId]/hooks/use-diff-review.ts`: a `useSyncExternalStore` hook shared by both views.
- `diff-tab-view.tsx`: Viewed toggle (a sibling button, not nested in the header button), count and next-unreviewed navigation. `git-panel.tsx`: viewed indicator.
- Not changed: the older full-screen `diff-viewer.tsx` dialog.

**Validation evidence**
- `pnpm run ci` passed. New tests cover fingerprint changes, invalidation on edit, pruning, malformed or throwing storage, and next-unreviewed ordering and wrapping.
- Browser check not done. The preview server config lives in the main checkout's `.claude/launch.json`, which this worktree session could not edit. A fixture page was written and then removed unused.

### 9. Repository preferences — implemented locally

**Decisions**
- Preferences are keyed by `(user_id, repo_owner, repo_name)`, lowercased like `vercel_project_links`. Only the owning user can read or write them, and every API route derives the user from the session.
- Null or blank fields fall back to account defaults. Repository skills are added to the user's global skills, with duplicates removed.
- The model applies when a chat is created (the first chat in a session and new chats); changing a chat's model later is untouched. Instructions and the check command are read on every agent turn, so edits reach sessions that are already running. Skills and the setup command apply when a sandbox is set up.

**Behavior**
- Settings → Repositories: add a repository (`owner/repo` or a GitHub URL), then set the model (or "Use my default model"), skills, setup command, check command and instructions. There is save/discard and a confirmed removal.
- Setup command: runs in the repo root after global skills when a fresh workspace is set up (provisioning workflow and `POST /api/sandbox`), with a 4-minute timeout. A failure is logged and does not fail provisioning. The agent is told the command exists and that its outcome is not reported, so it can re-run it.
- Check command and instructions: added to the agent's project-specific instructions under "Repository preferences". The agent is told to run the check command before reporting work as done and to report the real result.

**Changes**
- `apps/web/lib/db/schema.ts`: `repo_preferences` table. Migration `lib/db/migrations/0039_*.sql` (renumbered from 0038 at integration) creates the table only; no drift.
- `apps/web/lib/db/repo-preferences.ts`: get, get-for-session, list, upsert, delete.
- `apps/web/lib/repo-preferences/`: `schema.ts` (Zod input, limits, coordinate validation that rejects `.`/`..`), `resolve.ts` (model fallback, skill merge, prompt text), `parse-repo.ts`, `setup-command.ts` and `session-setup-command.ts`, each with tests where pure.
- Routes: `GET /api/settings/repo-preferences`; `GET|PUT|DELETE /api/settings/repo-preferences/[owner]/[repo]` (+ tests).
- Applied in `app/api/sessions/route.ts`, `app/api/sessions/[sessionId]/chats/route.ts` (GET's `defaultModelId` also reflects the repo model), `app/workflows/chat.ts`, `lib/sandbox/provisioning.ts` and `app/api/sandbox/route.ts`.
- UI: `app/settings/repositories/`, `repo-preferences-section.tsx`, `repo-preferences-editor.tsx`, `hooks/use-repo-preferences.ts`, and a sidebar entry.

**Validation evidence**
- `pnpm run ci` passed. New tests cover the schema (trim/blank → null, size limits, skill cap), model/skill/prompt resolution, the setup command runner (skip, cwd/timeout, failure tail, exec throw), repo parsing, the API routes (auth, user scoping, validation, delete 404), session creation with and without repo preferences, and repo instructions reaching the agent's call options.
- Not yet exercised: the settings page in a browser, migration 0039 in a preview deployment, and a real sandbox running a setup command.

### 10. Preview beside chat — implemented locally

**Behavior**
- Once the dev server is running, the header Globe button shows or hides a preview pane. The pane opens by itself when a start you asked for finishes, and closes when the server stops.
- From the `lg` breakpoint up, the pane sits beside the chat, diff or file view: 45% wide, at least 360px, at most 70%. Below `lg` it covers the main area until you close it.
- The toolbar shows the host, width presets (Fit, Mobile 390, Tablet 768, Desktop 1280), reload, open in new tab, and close. A preset wider than the pane is scaled down to fit, never up.
- While loading there is a spinner. After 8 seconds the pane says the app may refuse to be framed and offers "Open in new tab", because a cross-origin frame gives no signal when it is blocked. "Open in new tab" is always in the toolbar and uses `noopener,noreferrer`.

**Origin isolation**
- The frame loads the sandbox's own URL (`sandbox.domain(port)`, for example `*.vercel.run`) and is never proxied through the app. `resolvePreviewFrameUrl` accepts only absolute https URLs without credentials whose origin differs from the app's. A same-origin URL is refused rather than framed, because `allow-scripts` + `allow-same-origin` on the app's own origin would let the page reach the app.
- Sandbox flags match the existing codespace frame (`allow-scripts allow-same-origin allow-forms allow-popups allow-modals`), plus `referrerPolicy="no-referrer"`. The app sets no CSP `frame-src`, so nothing blocks the frame. A future CSP must allow the sandbox domains.

**Changes**
- `apps/web/lib/preview/preview-frame.ts` (+ `.test.ts`): viewport presets, URL rules, scale.
- `apps/web/app/sessions/[sessionId]/chats/[chatId]/hooks/use-preview-pane.ts` and `preview-pane.tsx`.
- `session-chat-content.tsx`: mounts the hook, points the Globe button at the pane, and wraps the main content in a row with the pane.

**Validation evidence**
- `pnpm run ci` passed. New tests cover URL acceptance and refusal (http, same origin, `javascript:`, relative, credentials), scaling and presets.
- Not yet exercised: a real sandbox dev server in the pane, a dev server that sends `X-Frame-Options`, and the layout at each breakpoint.

