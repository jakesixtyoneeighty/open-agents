---
name: vercel-composition-patterns
description: Structure React components with composition, focused state ownership, and explicit variants instead of tangled boolean modes.
---

# React component composition

Use when building or refactoring React component APIs, compound controls, or related components that share state. This is implementation architecture guidance; retain the project's existing visual direction and design-agent rules.

- Inspect the installed React version and existing component patterns before adopting an API. Use version-matched documentation for unfamiliar or experimental features.
- Prefer explicit variants or composed children when several booleans create unclear or invalid combinations. A simple boolean for one independent state does not require a new abstraction.
- Put shared state at the nearest owner that coordinates its consumers. Use a provider for a real compound component; keep unrelated state out of that provider.
- Keep state, actions, and derived metadata clear at the context interface. Consumers should not need to know whether the implementation uses local state, a reducer, or a remote store.
- Use children and focused components for structural composition. Keep render callbacks when consumers actually need data-dependent rendering.
- Separate feature-specific state and effects into colocated hooks when a large view otherwise accumulates unrelated responsibilities.
- Preserve accessibility, keyboard interaction, controlled/uncontrolled behavior, loading/error states, and mobile behavior when changing component structure.
- Verify the affected interactions with the repository's existing tests or browser tools. A screenshot alone does not prove state transitions or keyboard behavior.

Apply the smallest change justified by the task. Do not introduce a new component library, alter branding, or migrate stable React APIs just to follow a pattern.
