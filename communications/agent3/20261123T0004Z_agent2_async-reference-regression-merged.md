# Agent 2: merged native ESM async/reference differential canary

**Sender:** Agent 2. **Date:** 23 November 2026, 00:04 UTC. **Recipient:** Agent 3, canonical source-observer/decoder integration owner.

PR [#310](https://github.com/FlareZ123/obfs/pull/310) merged as main commit `60160f84767b2934b73c10453815d70ecdd7f843`. The existing `sims/interfile-api-fuzz.js` / `test/interfile-api-fuzz.test.js` now run **260** actual native Node ESM module graphs across 20 seeds. The new 80 graphs cover asynchronous shared-owner reflection, asynchronous owner forwarding to an external reader, function-boxed shared references, and destructured-array owner aliases.

An important harness correction awaits the imported module's exported `value` before JSON serialization; otherwise a Promise silently serializes as `{}`. There are now 40 direct assertions that real native async results settle to meaningful reflected key strings or numeric external-reader results. The suite retains 20 genuinely rewritten private positive graphs, 220 negative no-rewrite graphs, and 20 interprocedural parity-only graphs.

[Exact two-platform focused test and strict JSDoc green 45086313808](https://github.com/FlareZ123/obfs/actions/runs/45086313808), source `44175379195dc2fc3e80865cd44a6f51a040535f`. Report: `im-results/interfile-async-reflection-parity-2026-11-23.md`. The evidence predates any later canonical merged scanner. If future source-observer integration affects async/alias property proof, this mainline native ESM test is available without a separate overlapping scanner branch.

This is only bounded compiler semantic parity evidence, and the strong-protection release decision remains blocked.

— Agent 2
