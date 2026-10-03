# Tool completeness roadmap

Approved direction: phase the tool review and begin at the top. Implement and validate phase 1 before starting later phases. This extends the existing agent and its executor/design children; it does not introduce another agent.

## Sequence

| Phase | Scope | Dependencies | Acceptance | Status |
| --- | --- | --- | --- | --- |
| 1. Reliable, reversible editing | Shared editing engine; `multi_edit`; `apply_patch`; grouped diffs; operation-level `undo_edit`; fix literal replacement, overlapping writes, screenshot registration and explorer permissions | Existing sandbox, tool UI and mode filters | All files preflight before mutation; stale/ambiguous edits fail; writes serialize across server processes; rollback failures are explicit; undo preserves unrelated changes; main/executor/design tools and UI work; planning/review cannot edit; CI passes | Implemented; local validation passed; hosted acceptance pending |
| 2. Complete, recoverable search | Literal/regex modes, context lines, file/count results, accurate globs, explicit truncation and continuation | 1 | Searches can enumerate every match without rerunning earlier pages; workspace/symlink/sensitive-file policy applies; bounded Unicode-safe output; compatibility tests | Implemented; local validation passed; hosted acceptance pending |
| 3. Browser verification | First-class browser sessions, page/accessibility inspection, console/network evidence, interaction and keyboard tests using existing browser infrastructure | 1 | Real preview flows tested at desktop/mobile; session isolation; stored evidence; review receives only permitted inspection tools; no claim of interaction testing from screenshots alone | Planned |
| 4. Structured checks | `run_checks`, configured project scripts, diagnostics and retrievable logs bound to the checked revision | 1, 2 | Actual exit status, file/line diagnostics where supported, unknown formats retain logs; edits invalidate prior passing evidence; existing failures distinguished from new failures | Planned |
| 5. Process control | Start/status/wait/stop, stable IDs, readiness checks and log UI | Existing command logs; integrates with 3–4 | Background launch is distinct from readiness; long jobs survive the model step; stop targets only owned processes; timeout/expiry are explicit | Planned |
| 6. Checkpoint history UX | Discoverable change history and user-driven restore controls, beyond phase 1's operation-level undo | 1 | Preview exact inverse changes; preserve preexisting/unrelated edits; conflict-safe restore; retention and sandbox-expiry behavior visible | Planned |
| 7. Code intelligence and integrations | Symbols, definitions, references and semantic rename; then task-specific MCP connectors | 1, 2, 4 | Language-server results tied to workspace revision; rename uses shared edit engine; connectors expose truthful availability and scoped server-side credentials | Planned |

## Phase 1 contract

- Provider-neutral tools, unchanged model selection and reasoning settings.
- Structured edits and patch parsing converge on one sandbox-side engine. Existing `edit`/`write` use the same lock, so separate chats and subagents serialize their read-modify-write operations. New batch tools require read revisions; legacy tools accept optional revisions, and a full-file `write` without one still deliberately replaces current content.
- Text files only, bounded file/operation sizes, workspace-relative paths, no `.git` edits or symlink traversal. New batch/patch tools refuse dotenv paths; existing sensitive single-file operations retain approval and do not expose file contents in new results.
- Multi-edit supports several exact replacements per file, applied in order. Patch supports add, update, delete and move with strict context matching. Stale revisions and ambiguous hunks fail before any writes.
- Preflight every target under a sandbox-wide filesystem lock. Preserve literal replacement text and original file modes. Save a journal before mutation, write files atomically, and restore prior contents after write failures. Multi-file visibility is not a filesystem-wide atomic transaction: external shell commands can observe intermediate files and do not participate in the lock. Detect external changes; never silently overwrite them during rollback or undo.
- Operation IDs make retries idempotent within the persisted sandbox. Journals live outside the project and are not committed. Undo checks the exact post-edit state before restoring originals. History expires when the sandbox filesystem is replaced/deleted; cloud-independent history belongs to phase 6.
- Render grouped per-file diffs and outcomes. Keep full UI history while projecting compact results to the model. Refresh workspace/diff views after all mutation tools, including failures with partial state.
- Register screenshots for the main agent and review mode, including gallery/share/deletion plumbing. Remove arbitrary shell execution from the explorer; instructions alone are not a read-only boundary.

## Phase 2 contract

- `grep` and `glob` keep their names, compatible inputs and core output fields (`matches`, `matchCount`, `filesWithMatches`; `files[].path/size/modifiedAt`, `baseDir`, `count`). No new agent or tool name.
- One sandbox-side search worker (`packages/sandbox/workspace-search`) shipped like the edit worker: request payloads travel as SDK-written files, never shell text, and each result set has its own OS lock.
- `grep`: regex (JavaScript syntax, POSIX bracket classes such as `[[:space:]]` translated for compatibility) or literal mode; content, files or count output; 0–20 before/after context lines; basename globs without `/`, base-relative path globs with `/`.
- `glob`: real glob semantics against the base-relative path (`*`, `**`, `?`, classes, braces, escapes); `*.ts` is top-level only. Sort by modified time (default, as before) or path.
- A search snapshots its sorted candidate list and stores every entry outside the workspace (`/var/tmp/open-agents-search`, 6-hour idle retention). `nextCursor` reads stored entries; if the scan paused at its 20 s budget, the cursor resumes it from the next unscanned file. Earlier pages are never rerun, and edits after a scan do not shift later pages.
- Totals cover the whole search. `complete: false` with `incompleteReason` marks lower-bound totals (`time_limit`, resumable) or the 32 MiB stored-result cap (`result_limit`, narrow the search).
- Policy: workspace-relative paths only; never follows symlinks (base paths through symlinks fail, skipped links are reported); `.git` always excluded; hidden paths, `node_modules` and gitignored files excluded unless requested; dotenv contents are never searched; binary, >4 MiB, unreadable and timed-out files are counted with sample paths. Results say whether gitignore rules applied.
- Bounded output: pages stop at the requested limit (≤500) or about 16,000 characters; long lines are surrogate-safe 400-character windows with `contentOffset` for `read`'s `columnOffset`. A file that alone exhausts a fresh budget (for example catastrophic backtracking) is interrupted through a VM timeout and reported as skipped.
- Shared pages redact any legacy grep match content from dotenv files, including nested task results.

## Validation and release gates

1. Local engine tests: literal dollar tokens; repeated/missing/empty matches; same-file overlapping calls; stale revisions; late-file preflight failure; create/delete/move; CRLF and EOF handling; path traversal/symlinks; binary and size limits; modes; write/rollback failures; interrupted transaction recovery; retry and undo conflicts.
2. Integration: real tool registration and mode filters, executor/design availability, compact model output, grouped UI and failure states, workspace refresh, shared-content redaction, screenshot references.
3. Required repository gate: `pnpm run ci` and `git diff --check`.
4. Live acceptance remains separate: authenticated hosted model calls, the installed sandbox runtime and filesystem lock, hibernate/resume, screenshot storage and owner/shared access, and diffs from actual hosted runs. Do not equate local fixtures with deployment acceptance.

## Progress

- Phase 1 implemented: revision-aware multi-edit and patch tools, dry runs, grouped main/subagent diffs, sandbox-side serialization, recovery journals and conflict-safe undo. Existing single-file edits share the engine and preserve literal replacement text.
- Capability fixes implemented: screenshots registered on the main agent, screenshot storage references collected for owner/share/deletion flows, explorer shell removed, shared chats wrapped in the diff provider, and new tools wired into workspace refresh and changed-file summaries.
- Local validation: `pnpm run ci` passed all 140 isolated test files, formatting/lint, bundled-skill verification, typechecks and migration consistency. `git diff --check` passed. Engine tests execute the shipped worker on real files and use an OS advisory lock across separate processes (macOS uses `fcntl` for the test harness; the hosted adapter uses Linux `flock`).
- Browser fixture validation confirmed grouped diffs, created/updated labels, dry-run labeling and explicit recovery details at a narrow viewport. This used a temporary unauthenticated local route, removed afterward; it does not establish live account, screenshot-storage or hosted sandbox acceptance.
- Remaining release gate: run an authenticated hosted edit/patch/undo cycle, verify `flock` in the sandbox image, then repeat after hibernate/resume. No deployment or GitHub publication performed.
- Phase 2 implemented: sandbox search worker with stored, resumable pages; `grep` literal/regex modes, context, files/count output and accurate globs; `glob` full-path glob semantics; paged/incomplete/skipped states in the web renderers and task summaries; dotenv redaction for legacy shared grep results.
- Phase 2 local validation: worker tests execute the shipped worker on real files (literal metacharacters, POSIX classes, CRLF, context, exhaustive cursor paging over a modified workspace, character budget and surrogate-safe windows, glob semantics, gitignore/hidden/node_modules, symlink/workspace/dotenv/binary/size policy, resumed time-limited scans, ReDoS interruption, expired cursors, retry replay). Tool and renderer tests cover compatible output, cursors and mismatched/invalid cursors. `pnpm run ci` and `git diff --check` passed.
- Phase 2 remaining release gate: run hosted `grep`/`glob` calls in a real sandbox (Node `vm` timeout, `flock`, git availability and ownership, `/var/tmp` persistence), including a large repository and a cursor after hibernate/resume.
- Next implementation increment: phase 3, browser verification.
