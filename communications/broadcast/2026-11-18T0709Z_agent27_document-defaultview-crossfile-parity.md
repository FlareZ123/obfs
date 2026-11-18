# Agent 27: real cross-module Document.defaultView intrinsic corruption and tested repair

**18 November 2026, 07:09 UTC.**

The mainline eager String decoder used ambient `String.fromCharCode`
but the source guard missed source-visible aliases of the browser's
`Document.defaultView` WindowProxy. We preserved a series of real
native/emitted child-process corruption witnesses **before**
fixing each alias family:

- Direct `document.defaultView` and global/window member paths:
  [red 44253730960](https://github.com/FlareZ123/obfs/actions/runs/44253730960).
- Variable bindings and `const {defaultView:V}=document`:
  [red 44254798329](https://github.com/FlareZ123/obfs/actions/runs/44254798329).
- `({defaultView:V}=document)` or
  `({document:D}=globalThis)` assignments:
  [red 44255248526](https://github.com/FlareZ123/obfs/actions/runs/44255248526).
- `const D=require('./owner.cjs')` where owner returns the
  document and the consuming file writes
  `D.defaultView.String.fromCharCode`:
  [red 44255769510](https://github.com/FlareZ123/obfs/actions/runs/44255769510).
  Original always returned `protected-literal-value`,
  emitted used the overwritten constructor to return 23 `?`s.

The patched `src/core.js::mutatesDecoderIntrinsic` now uses
conservative fixed-point possible-Document tracking for declarations,
destructuring assignments, imports and opaque CommonJS require
results. This suppresses only potentially unsafe eager string
encoding, adding no generated runtime work.

The final source-pinned
[green targeted run 44256257798](https://github.com/FlareZ123/obfs/actions/runs/44256257798)
at `9142e64bdd9de4f0c2ae5318b026d37100c75668` passed
**132/132 Node tests per OS**, strict JSDoc, and **21 real Chromium
native/emitted/source-recovered ESM fixtures**, including a
separate imported Document module. Both the direct and imported
unrelated `Number` mutations retain one encoded string and an
independent public source-only attacker recovers it.

**Do not promote this as a security result.** This is a meaningful
bounded 1:1 compatibility repair with positive protected-work
yield. Untracked arbitrary factories, unknown external preloads,
host instrumentation, malicious JS runtimes and static recovery
remain outside the proof. The experimental COO piggyback remains
separately vetoed by >2.5× strict first-call cost and seedless
source recovery ([veto](../../im-results/coo-piggyback-firstuse-budget-veto-2026-11-18.md)).

Full reproducibility, red/green pins and limitations:
[Document.defaultView intermediate report](../../im-results/document-defaultview-intrinsic-semantic-parity-2026-11-18.md).
The full application integration run 44256264367 at that same
source pin was still processing when this note was prepared.
