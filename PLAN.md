# Task and design brief

## Summary
Implement suggestion 2 first: an optional editable brief that starts a read-only planning conversation, supplemented by a bundled `task-planning/SKILL.md`. Users explicitly choose **Build this plan** to enable implementation.

## Context and approach
The existing chat already persists typed data parts, supports questions and resumes durable runs. Use user-message brief snapshots as the source of truth rather than adding a second database store. Opening/editing the form is local; submitting saves a snapshot with the user message. Revising and rebuilding preserve earlier snapshots in conversation history. No database migration is needed.

## System impact
- Add a validated brief data part with goal, audience, requirements, references, constraints and acceptance criteria, plus plan/build intent.
- Derive planning state from the most recent user brief snapshot, including during question continuations and refresh/fork. Reject malformed brief input at the chat boundary.
- Planning supplies only read/search/question tools; no shell, writes, delegation, or automatic commit/PR. Workspace provisioning remains possible for repository inspection.
- Read the canonical bundled skill inside a workflow step; explicitly include it in deployment tracing.
- Reuse normal chat persistence, ownership, sharing, and retry behavior. Briefs are conversation content and visible when users share a conversation.

## Changes
- `apps/web/lib/task-brief.ts`: schema, message state and prompt helpers.
- `apps/web/components/task-brief/`: focused editor, transcript summary, and planning controls.
- Chat content: mount controls and render brief snapshots.
- Chat request/workflow: validate, convert data to model context, inject skill and disable git automation for planning.
- `packages/agent/planning.ts` and agent call options: enforce the planning tool allowlist.
- `apps/web/lib/skills/task-planning/SKILL.md`: planning behavior; loader and deployment tracing.
- `docs/plans/user-experience-roadmap.md`: preserve the remaining approved sequence.

## Verification
Test valid/invalid briefs, role boundaries, follow-up planning persistence, explicit build transition, tool restrictions, workflow option propagation and suppression of git automation. Run `pnpm run ci`, inspect the UI where local authentication permits, and distinguish source checks from live hosted acceptance.

## Status
Implemented. The user authorized this increment; later roadmap increments remain queued.

## Validation evidence
- Focused schema, request, tool restriction and workflow tests passed, including plan/build transitions and suppression of commit/PR automation.
- Browser-tested the real components in a temporary local fixture at 1440px and 390px: required goal, submitted brief recovery for editing, revision, build transition, failed-send recovery, interrupted-plan disabling, Escape dismissal, and no horizontal overflow. Fixed a mobile modal footer overflow found during inspection. Removed the fixture after checking it.
- `pnpm run ci` passed: formatting, lint, type checks, all isolated tests, and migration consistency. Two stale existing test fixtures were aligned with the current default model and Gateway exports; runtime settings were preserved. Live authenticated model/sandbox execution and deployment have not been exercised.
