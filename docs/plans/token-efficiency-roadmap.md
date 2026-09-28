# Token efficiency without reduced output quality

Scope: implement all five recommendations from the project review. Preserve model selection, reasoning effort, user requirements, security controls, complete transcripts, and access to diagnostic evidence. No deployment or paid benchmark is part of local implementation.

## Sequence and acceptance

| Milestone | Dependencies | Implementation | Acceptance |
| --- | --- | --- | --- |
| 1. Baseline and duplicate todo output | None | Compact model acknowledgement with complete UI output; owner-only numeric usage report covering parent and children | SDK conversion and live-loop fixtures preserve todo input/UI state; missing usage stays unknown; reports contain no prompts, arguments, file paths or output text |
| 2. Consistent caching | 1 | One Gateway caching default for main and all subagents, with explicit override support | Model/provider options and request fixtures preserve reasoning and privacy defaults; no competing manual cache markers; live cache reads remain a separate gate |
| 3. Conservative duplicate reads | 1–2 | Request-only projection based on resolved identity, file revision, exact complete range and content | Earlier evidence stays intact; later identical reads reference it; changed, clipped, failed, ambiguous and same-batch reads remain; original history is immutable; projection is repeatable |
| 4. Focused, recoverable tool output | 1–3 | Bounded file windows with continuation; head/tail command previews and retrieval of SDK-retained logs | Huge lines and output remain retrievable; command exit status survives; retrieval stays within the active sandbox; old backends retain their existing behavior |
| 5. Reduce unnecessary model turns | 1–4 | Milestone todo updates, validation after coherent changes, remove demands for extensive reflection on every action | Required checks, final verification, persistence and security instructions remain; comparative quality evaluation is required before claiming unchanged quality |

## Quality and savings gate

Run a fixed baseline and candidate corpus on identical repo commits, model IDs, reasoning settings, tool permissions and prompts: small bug fix, multi-file change, failing tests, large logs, repeated/changed file reads, design work and resumed conversations. Use independent clean sandboxes. Repeat tasks to account for model variance; include both cold and warm cache runs.

Measure parent **plus** subagent input/output/reasoning tokens, cache reads/writes, reported cost, model steps and duration. Keep character counts separate from provider tokens. A missing field is unknown, never a measured zero. Compare completion, acceptance tests, required diagnostics, retries, regressions and final-answer usefulness. Reject an optimization if quality declines, even if the prompt shrinks. Prompt caching saves cost/latency, not context-window space; rereading omitted content can offset smaller initial payloads.

Do not replace evidence with lossy summaries, strip required reasoning state, lower reasoning effort, change models, or weaken authorization to meet a token target. Logs are sandbox-local and may expire on sandbox replacement; report unavailability rather than rerunning commands automatically. Shared chat access does not grant access to the measurement endpoint.

## Implemented behavior

- **1 — implemented locally:** `tools/todo.ts` returns the complete list to the UI and a short acknowledgement to the model in both live calls and replay. `efficiency.ts`, the chat workflow and task tool record numeric usage, reasoning, cache reads/writes, reported cost, model-step count and duration in existing message JSON; no database migration. Unknown or partly reported totals remain null. Historical turns without measurements remain unknown.
- **2 — implemented locally:** `models.ts` defaults all Gateway models to `gateway.caching: "auto"`. Main and child agents share that factory. A model variant can set `providerOptionsByProvider.gateway.caching: false` to remove the option before sending; other routing/provider settings are preserved. The main agent no longer adds manual Anthropic markers. Models, reasoning settings, encrypted reasoning and OpenAI non-persistence remain unchanged. [Provider behavior](https://vercel.com/docs/ai-gateway/models-and-providers/automatic-caching).
- **3 — implemented locally:** `context-management/read-projection.ts` runs before each main/child request. It retains the earliest full evidence and references it from later identical successful results, using canonical identity, whole-file SHA-256, exact line range and exact content. Internal identity metadata is removed before transmission. It never replaces changed versions, clipped/column-continuation results, failures, ambiguous IDs, tiny results or reads first encountered together in a parallel batch. This intentionally does not implement lossy compaction or removal of superseded changed versions.
- **4 — implemented locally:** reads default to 200 lines (explicit maximum 2,000), with a 16,000-character ceiling and `nextRead` continuation even inside a huge line. Bash previews retain head/tail within 8,000 characters per stream when the backend supports retrieval. `command_output` retrieves stdout/stderr pages from the connected SDK session by command ID, without executing a command or writing logs to the repository. Unicode pairs survive page boundaries. Backends without retrieval keep their old limits. SDK logs can expire on sandbox replacement; timeout failures before a command handle is returned may not supply an ID.
- **5 — implemented locally:** system and todo instructions track meaningful milestones, permit related status updates together, validate coherent edits and repeat passed checks only when justified. Required checks, final verification, security, approvals and task completion remain in force. Todo descriptions now use the actual schema status names.

## Reading measurements

As the signed-in chat owner, GET `/api/sessions/<sessionId>/chats/<chatId>/token-efficiency`. The response is private/no-store and contains per-assistant-turn `main`, `children` and `combined` metrics. The report excludes prompts, tool arguments, paths and answer text. It is not available through shared-chat permissions. It reflects measurements captured so far, not proof that a task succeeded.

`combined` adds parent and child token/cost measurements exactly once. Its duration is null because child execution overlaps parent elapsed time; use `main.durationMs` for recorded main-step elapsed time and inspect child durations separately. These durations exclude time spent waiting for user approval between runs and are not full end-to-end latency. Missing child or legacy measurement records make the combined measurement unknown. Unknown metrics must not be treated as zero or inferred from character counts.

To establish a baseline with the same measurement format, apply only the measurement changes to the original revision in a separate checkout. Keep todo projection, caching, read projection/limits and prompt changes out of that baseline. Compare against this candidate using the fixed corpus above; do not compare different model versions or only the parent's token totals. Save test outcomes and human quality assessments alongside each report.

## Validation and next milestone

All five recommendations have local implementations. Regression coverage includes actual AI SDK live/replayed todo projection; all three child-agent request boundaries; immutable duplicate-read projection; changed/clipped/ambiguous/parallel reads; Unicode continuation; SDK log retrieval with original exit status; numeric usage aggregation; legacy/resumed turns; and authentication, session ownership and chat/session matching for reports.

Local validation passed with Node 24.21.0 and Bun 1.3.12: `pnpm run ci` completed formatting, lint, all workspace typechecks, **130 isolated test files**, and migration consistency. `git diff --check` passed. No production deployment, authenticated live-sandbox acceptance or paid model benchmark has run. The **next milestone is the baseline/candidate quality and savings evaluation**, not more aggressive pruning or lower reasoning settings. Do not claim measured savings or unchanged output quality until that gate passes.
