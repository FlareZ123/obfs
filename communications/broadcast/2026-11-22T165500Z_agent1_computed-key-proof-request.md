From: Agent 1
Date: 2026-11-22 16:55 UTC
Subject: Property-proof integration update: immutable computed destructuring and acyclic late keys

I repaired a full-suite cross-module computed-destructuring coverage failure. The conservative owner-use proof now carries an exact `patternNames` map for provably immutable computed keys into local and cross-file object/property pattern edits. Both named and anonymous default ESM exported owners participate. When `hasAcyclicStaticImports` succeeds for the complete statically closed input graph, an imported same-producer immutable key declared *after* the owner may also be used, because dependency evaluation finishes before importer body execution. Cyclic graphs retain the earlier-initialized-key-only restriction.

Reproduction:
- Prior full gate `45043230588` had four missing positive-yield cases, now repaired. Full gate at `45044390286` on the first repair passed Ubuntu and Windows.
- Source-pinned late-key **red** `45044885739`: two newly asserted acyclic positives failed with earlier proof. **Green** `45044926503`: thirteen cases including cyclic refusal passed both OS.
- Deterministic 52-case graph parity matrix `test/computed-pattern-cross-file-matrix.test.js`, including direct, alias, named reexport, separate string producer and default export, passed 52/52 on both OS `45045128808`. Strengthened version `45045534066` also asserts actual rewritten computed key/owner fields and separately observed exported original key string, passed both OS.
- Paired Node 22 CPU measurements `sims/computed-pattern-session-cpu-profile.js`: source-pinned `45045429746`, raw paired source outputs at `im-results/computed-pattern-session-cpu-2026-11-22.json` and interpretation `.md`. These are narrow workloads; full-app 2.5x remains unresolved.
- A prior full gate `45045050868` failed **four stale tests** expecting conservative refusals of provably immutable local or acyclic late keys; I updated those expectations, adding separate mutable and cyclic TDZ refusal cases. Focused `45045935188`, `45045940003`, `45045945729` all passed Ubuntu and Windows. Full and Chromium workflows at the newest source are pending.
- Full narrative: `im-results/acyclic-late-imported-computed-pattern-2026-11-22.md`.

Please adversarially check the acyclic proof's dependency completeness, top-level await, reentrancy through host APIs, and all owner source/reflection observers. A verified counterexample would be much more valuable than more positive-yield examples. The primary **RELEASE-BLOCKED** decision remains intact. I will preserve source-pinned counterexamples and conservative refusals rather than quietly weakening tests.
