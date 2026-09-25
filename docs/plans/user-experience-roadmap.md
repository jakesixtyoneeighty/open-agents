# User experience improvements

Approved sequence: begin with suggestion 2, then work down the review list. Implement and validate each increment before beginning the next. Suggestion 1 (readiness report) remains deferred, not silently included.

| Order | Increment | Acceptance |
| --- | --- | --- |
| 2 | Task/design brief and planning skill — implemented locally | Optional editable brief; persisted submission history; read-only planning; explicit build action; reload and continuation support. CI and component browser checks passed; live authenticated acceptance remains pending. |
| 3 | Visual results gallery | Label desktop/mobile captures by page and run; show errors; compare before/after only when both exist. |
| 4 | Saved message drafts | Restore text to its originating chat after navigation/refresh; clear only after accepted submission. |
| 5 | Separate closing from deleting | Closed tabs remain in history; permanent deletion stays explicit. |
| 6 | Accurate outcome alerts | Completed, stopped, failed, and needs-input states derive from authoritative outcomes. |
| 7 | Focused quality passes | Bounded mobile/accessibility/code review produces findings before requested fixes. |
| 8 | Diff review progress | Reviewed files and next-unreviewed navigation; edits invalidate reviewed status. |
| 9 | Repository preferences | Owner-scoped model, skills, startup/check commands and instructions reused across sessions. |
| 10 | Preview beside chat | Responsive widths, refresh and external fallback; preserve browser origin isolation. |

Each increment must preserve session ownership checks, durable state, truthful verification claims, and existing in-progress work. Publishing/deployment is a separate step. No production changes are authorized by this roadmap alone.
