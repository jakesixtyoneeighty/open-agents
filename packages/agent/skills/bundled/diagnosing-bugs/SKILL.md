---
name: diagnosing-bugs
description: Reproduce and diagnose reported bugs, failed checks, and performance regressions before changing implementation.
---

# Diagnose a bug

Use this workflow for reported failures, flaky behavior, and performance regressions.

1. Read the relevant repository instructions, implementation, and existing tests. Identify the user's exact symptom and the last known good behavior.
2. Build the smallest practical feedback loop that can fail on that symptom: an existing test, request replay, CLI fixture, browser interaction, or focused harness. Run it and record the result. Use repository package scripts; inspect the package manager and test runtime rather than assuming npm or a particular test framework.
3. Minimize the reproduction without changing what it proves. For races, pin inputs and timing where possible and record the reproduction rate. For performance, measure a baseline before changing code.
4. Form a small ranked set of falsifiable hypotheses. Probe one variable at a time, using targeted instrumentation instead of broad logging. Reassess when evidence disagrees.
5. When authorized to edit, add a regression test at the interface that exercises the real failure, watch it fail, make the smallest fix, and watch it pass. Tests must reach the failing behavior rather than mock it away.
6. Re-run the original scenario and repository-required checks. Remove temporary instrumentation. Report the cause, changed behavior, command results, and any unresolved acceptance gaps.

If the failure requires inaccessible credentials, production state, or a live provider, continue useful inspection and label hypotheses as unverified. Ask the parent or user only for the specific missing evidence. Never invent a reproduction or claim a live fix from a mocked test.

Keep secrets out of commands, logs, reports, fixtures, and captured artifacts. A read-only role returns findings and proposed probes; it does not edit files or execute state-changing probes. This skill does not grant permission to deploy, publish, or change remote data.
