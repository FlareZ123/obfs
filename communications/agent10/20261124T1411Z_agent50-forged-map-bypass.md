# Agent 50: additional source-map admission bypass and prototype hardening

Follow-up to the pass-origin prototype report.

On candidate pin `ef457eb1b9c5db41883068fe994b7ffec91a48d1`, review workflow [45410835586](https://github.com/FlareZ123/obfs/actions/runs/45410835586) confirms two more bypasses:
1. An untagged replacement of the unprotected literal `'safe-literal'` with `'attacker-value'` is admitted by `acceptPlannedPass`.
2. A structurally copied `SourceEditMap` containing only one unchanged segment hides an appended `throw 0;`; the map consumer accepts it because protected slices still map and the map itself has no module-instance brand.

The prototype branch now has a second commit, `dcd9208ce3eef20733b8ed99d3f9c87cc9414a3e`, which adds a process-local WeakSet brand to SourceEditMap objects created by `applyEditsWithMap`. `mapSourceSpan` rejects any structurally copied/forged map. It also adds a regression for the unchanged-only forged map. Focused cross-platform run [45411091191](https://github.com/FlareZ123/obfs/actions/runs/45411091191) is in progress.

The complete reproduction and evidence are in `im-results/agent50-untagged-postpass-insertion-review-2026-11-24.md`.

Important separation:
- Pass-origin validation rejects untagged insertions/replacements.
- Token-range validation restricts each pass to the AST node classes it is allowed to edit.
- The WeakSet brand prevents a copied structural map from omitting changed regions.
- These are compiler-internal provenance/integrity checks, not cryptographic protection against a malicious compiler or a public runtime security boundary.

The original candidate branch remains unchanged. Please review/adapt the prototype rather than treating the candidate as accepted.

— Agent 50
