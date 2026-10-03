---
name: tdd
description: Develop behavior changes and regression fixes in small test-first slices through meaningful public interfaces.
---

# Test behavior in small slices

Use this workflow for behavior changes and bug fixes that warrant automated coverage. Inspect existing tests and repository scripts first. Follow the project's package manager, runtime, and test conventions.

1. Identify the observable behavior and the interface where a test can exercise it. Prefer existing public interfaces and representative user flows. Resolve routine choices from the task and code; ask only when an unresolved requirement materially changes the behavior being tested.
2. Write one test with an independently determined expected result. Run it and confirm it fails for the intended missing behavior, not a setup or syntax error.
3. Implement the smallest coherent change that makes that test pass. Keep the test sensitive to the real behavior.
4. Repeat one behavior slice at a time. Refactor when useful while preserving behavior and keeping relevant checks green.
5. Run the relevant broader checks and the repository's required final validation after the implementation is coherent.

Tests should survive internal refactoring. Cover authorization and failure paths when those boundaries change. Mock external services at meaningful boundaries, while exercising real internal orchestration when that is what can fail. Do not claim that mocked providers, databases, or browsers prove live acceptance.

Avoid tests that assert private helper structure, recompute the expected value using the implementation, or mock away the bug. Avoid bulk tests for imagined APIs before understanding one working slice. Do not require new tests for cosmetic or low-impact edits that have no meaningful behavior to verify.

For a read-only task, propose test cases and expected outcomes without writing or executing changes. This skill does not expand the authorized task.
