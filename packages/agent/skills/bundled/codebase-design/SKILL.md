---
name: codebase-design
description: Design focused modules and testable interfaces when behavior crosses files, packages, or architectural boundaries.
---

# Focused modules and useful interfaces

Use this guidance when introducing a distinct responsibility, extracting a large component, or changing package and service interfaces. Preserve the repository's vocabulary and architecture.

A useful module hides meaningful complexity behind an interface that callers can understand. The interface includes inputs, outputs, failure modes, ordering constraints, authorization, and lifecycle ownership, not only types.

1. Trace callers, data ownership, side effects, and existing boundaries before proposing a new abstraction.
2. Group behavior that changes for the same reason. Keep unrelated UI, persistence, orchestration, and provider details in focused modules. Extract a distinct cluster of state, effects, handlers, and derived labels into a colocated hook or component where appropriate.
3. Define the smallest interface that supports current requirements. Make lifecycle ownership, cancellation, retries, idempotency, and error handling explicit where relevant.
4. Keep validation and authorization at the real trust boundary. Refactoring must preserve ownership checks, isolation, immutable history, and failure behavior.
5. Make tests exercise observable behavior at the interface. Inject external dependencies when needed for real variation or deterministic verification; avoid a framework of hypothetical adapters.
6. Compare alternatives by how much complexity callers must understand, how localized future changes will be, and whether the real failure modes can be tested.

Do not reorganize the whole repository, replace its architecture, install boundary-enforcement packages, or create new conventions as a side effect of a scoped task. A read-only role returns design findings and tradeoffs. An implementation role changes only the authorized scope.
