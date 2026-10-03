# Tool permissions

Planning and quality-review modes use server-side tool allowlists. New mutation tools are excluded by default. Quality review additionally receives the registered screenshot and browser_inspect tools; browser_session and browser_action remain build-only. URL inspection uses a fresh browser context that is closed afterward, with no input actions or arbitrary evaluation; page loading still executes application scripts. The explorer has no shell tool.

The ordinary build agent uses the approval rules in `tools/bash.ts`: selected dangerous command patterns and sensitive paths require approval. This is a denylist, not a general read-only shell or a command sandbox. Do not describe unknown commands or out-of-workspace cwd values as automatically approval-gated.

`read`, `write`, and `edit` request approval for dotenv paths. Coordinated file tools reject traversal, `.git`, symlinks, hard links, binary files and oversized operations at execution. `multi_edit` and `apply_patch` refuse dotenv files; use an approved single-file edit when needed. `undo_edit` requires approval and cannot restore sensitive files.

Build-capable agents share the sandbox editing engine and its process-wide filesystem lock. Arbitrary shell commands do not participate in that lock. Plan/review/explorer cannot access the editing tools. Skills do not grant additional tools or permissions.
