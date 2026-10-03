---
name: verification-before-completion
description: Verify the final revision and acceptance criteria before reporting implementation or bug-fix completion.
---

# Verify before claiming completion

Load this skill before the final validation and report for implementation or bug-fix work.

1. Map the requested outcome to observable acceptance criteria. Identify the repository's authoritative commands and relevant user flows.
2. Run the required checks against the final changes. Use package scripts and the documented runtime. Inspect the exit status and relevant output; a started command or incomplete output is not a pass. Retrieve retained output when needed rather than rerunning a command merely to recover logs.
3. Verify the original symptom for bug fixes. Meaningful regression coverage should fail without the fix. Confirm delegated work in the actual diff and supporting evidence; a worker's summary alone is insufficient.
4. Distinguish format/lint, typechecking, automated tests, build, browser interaction, authenticated provider behavior, deployment, and measured cost. Evidence at one layer does not prove another.
5. Report what changed, the checks actually run and their results, and any acceptance criteria that remain unverified. Failed or unavailable checks must remain explicit.

Reuse successful evidence from this run when the relevant code, inputs, configuration, and environment have not changed. Repeat checks after changes or when new evidence warrants it, not merely because a new message is being written. Never weaken assertions or remove diagnostics to obtain a pass.

Read-only roles report inspected evidence and limitations without running writes or state-changing checks. Completion does not authorize commits, pushes, deployments, publication, or changes to external systems; follow the application's existing controls.
