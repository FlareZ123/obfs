# Agent 1: SCO per-GET compilation omits native cross-file DOMString observer proof

**Status as of 2026-11-28 09:58Z:** code-level audit and an isolated test/fix pair; exact-head cross-platform Actions runs are **queued and not yet validated**. Do not describe as a demonstrated runtime counterexample or accepted fix until real receipts.

### Architectural boundary

The donor #396 core compiler has a group-level `hasImportedDomStringSourceSink(prepared)` check for imported DOM receiver or factory values. Its real-browser donor tests call `obfuscateFiles([state,consumer], {mode:'sco'})` over a complete graph, so they can get a correct source observation veto. **Actual `createScoHandler` differs**: it computes `interfileSourceObserver` using local AST/distributed-source checks, then for each GET invokes `obfuscateFiles([input],{mode:'sco',...})` on **one file**. The core imported-DOM source proof requires >1 module and cannot fire during this per-file request. This is a plausible native `element.setAttribute('data-source', fn)` function-text parity gap. Further, `renameCrossFileProperties` was applied at SCO initialization even if the group observer flag was true, so a later per-GET veto could not revert that rewrite.

### Exact source pins and next step

- **Test-only / red-first:** `agent1/sco-domstring-http-group-proof-falsifier-20261128` at [432c92bb](https://github.com/FlareZ123/obfs/commit/432c92bb4c63b6862038e331fd08a22cc184accb), file `test/agent1-sco-http-domstring-interfile-source-parity.test.js`. Test starts **real HTTP server** from `createScoHandler`, fetches GET responses, evaluates them in Node ESM with an external DOMString-style host, and compares exact `String(fn)` captured by setAttribute plus numeric result. Cases: direct carrier, direct barrel, alias barrel, star barrel, default reexport. Safe standalone SCO file must still mutate (positive protection-yield control). Focused run was queued at writing.
- **Prototype fix:** `agent1/v2-sco-domstring-group-parity-fix-20261128` at [53ee37b](https://github.com/FlareZ123/obfs/commit/53ee37b803c6149ebad5bf0ce436e2482a34448d), based on evolving V2 reexport/namespace candidate. It exports core's internal graph-wide detector to `src/sco.js` and conservatively vetoes per-request source changes **and** SCO init `renameCrossFileProperties` when the published graph has the native DOMString effect. Focused run queued; strict JSDoc/full Node+browser/real SCO must pass before promotion. This branch includes broader unvalidated V2 changes: **do not cherry-pick wholesale into main or PR #396**.

### Acceptance

Treat `mode:'sco'` tested through core as distinct from **actual SCO HTTP publication**. The endpoint is a separate execution path and requires its own source/output/positive-yield receipts under equal trust. Frozen PR #384 remains NO-GO regardless of these experiments.

— Agent 1