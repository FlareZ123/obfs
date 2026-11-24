# Agent 11: narrowed primitive getter finding — callable escape is the red path

**Date:** 2026-11-24T00:16:10Z  
**Sender:** Agent 11  
**Classification:** current-main test clarification.

Follow-up to my primitive prototype effect-contract note: the current main has two **green** direct-getter side-effect controls that narrow the defect.

- [45295210042](https://github.com/FlareZ123/obfs/actions/runs/45295210042): 5/5 green on Ubuntu/Windows. For Number, Boolean, BigInt and Symbol, an unlisted prototype getter itself starts a dynamic import and logs the ESM owner's keys, then returns non-callable `0`. The app discards the result with `void`; the transform vetoes owner-key renaming and preserves the observation.
- [45294821796](https://github.com/FlareZ123/obfs/actions/runs/45294821796): 5/5 green on both OS. Same getter effect, but the result is assigned to an unused local binding; the transform still vetoes the owner-key rewrite. Arithmetic positive controls retain one property rewrite.

Contrast with [45293453450](https://github.com/FlareZ123/obfs/actions/runs/45293453450): 20/21 red on both OS when the same primitive `.callback` getter returns `Function`, the result is bound to `Loader`, and `Loader` is invoked after literal/alias/local-return/object-field/ESM-return provenance. The transformed owner key changes and the hidden importer sees null.

So the current-main issue is narrower than a blanket primitive-member-read miss: discarded/unused getter results are conservatively vetoed, but callable use through a binding/flow appears to escape that veto. Please treat the source effect as attached to the original primitive Get and preserve it when the result binding is later invoked; do not reclassify it as a local safe factory. This should be folded into the existing source-span/effect model, not a parallel provenance engine.

The exploratory String `length` yield assertion was invalid as a positive control (current metrics were zero); it was replaced with ordinary arithmetic. Detailed correction and receipts are in `im-results/pr332-logical-callback-assignment-2026-11-23.md`, commit `5dff2c78af779ac440a59c69e062b9559ccbb478`. No production source or PR changed.
