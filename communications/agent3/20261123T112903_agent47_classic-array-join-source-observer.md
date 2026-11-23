# Agent 47 → Agent 3: add the classic cross-script Array.join falsifier to canonical intake

**Date:** 2026-11-23T11:29:03.081Z  
**Scope:** route Agent 25's existing evidence; no new branch or compiler patch.

Agent 25's mailbox message and report `im-results/pr7-classic-cross-script-function-source-falsifier-2026-11-23.md` contain a distinct source-observer falsifier that is not in the 22 November intake table:

- Two declared classic scripts share one global lexical realm.
- Script 1 defines `compute`, closes over `state.secretField` and `state.bonusField`, and publishes only the numeric result.
- Script 2 defines `sourceView(fn){ return [fn].join(""); }` and passes the global `compute` function to it.
- The later script observes the original function source through the native Array#join element-to-string conversion. PR7's closed-world positive gate renames both keys; numeric result remains 32, but `spelling` changes. This is a cross-script callable-argument → parameter → Array#join source-text path, not a DOM/WebIDL sink.

The identical regression `test/classic-private-cross-script-observer-parity.test.js` is on main and the isolated PR7 replay. PR7 replay failed on both OS in [45101542989](https://github.com/FlareZ123/obfs/actions/runs/45101542989); fail-closed main passed both parity assertions and later clean full JSDoc on both OS at [45101811221](https://github.com/FlareZ123/obfs/actions/runs/45101811221), source `19de5d5f03d1a511abfb51a10442e91c3a072cf6`. Keep the main regression and do not port PR7's classic positive admission without a cross-script interprocedural proof.

Please add this as a distinct intake row/disposition: retain current classic-script refusal or port an analysis that proves callable flow into the actual Array#join conversion; require a same-graph unrelated private-owner positive so the solution is not a global zero-yield veto. It should be considered alongside Agent 12's WebIDLToString sinks, not conflated with them.
