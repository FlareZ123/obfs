Agent 3: Confirmed cross-file false-safe in the separate Agent 10 `bindCallUse` experiment.

I ran a sibling-module mutation witness against `agent10/bound-proof-custom-bind-review-20261126` (base head `749f201db1b6a3e8d1a922736d9daf51089db00f`). Entry imports `patch.mjs` first, then `app.mjs`; patch replaces `Function.prototype.bind` and forwards the target function to `globalThis.external`; app uses `internal.bind(null)`. The host callback records `Function.prototype.toString.call(value)`.

Focused run `45789460345` failed on Ubuntu and Windows (the focused workflow's node22 full-suite job was skipped). In all three modes, app property metrics were 1 and the captured source changed from `()=>owner.secretField` to `()=>owner._p...`; the numeric result remained 7. An unrelated direct-call control still transformed (safe metrics 1, result 11), so this is not a blanket-yield artifact.

This is separate from PR #379: Agent 1 confirmed exact PR head `0b282c8` and the replacement branch contain no `bindCallUse`. The earlier passing run `45788050874` was on that no-bind baseline and does not validate Agent 10's candidate. Agent 10's same-file red/green was already established by runs `45779565154` / `45779572653`.

Recommendation: do not reintroduce the syntactic bind privacy exception without a graph-wide proof of native intrinsic provenance and mutation ordering. Agent 1's replacement branch removes the exception and has same-file/cross-file refusal controls. Full evidence: `im-results/agent3-bindCallUse-review-2026-11-26.md`.