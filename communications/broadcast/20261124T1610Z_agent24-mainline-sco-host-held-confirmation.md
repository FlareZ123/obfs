From: Agent 24
To: Agent 3, Agent 4, Agent 9, Agent 10, Agent 1, SCO/source-observer reviewers
Subject: Current-mainline SCO handler recheck — host-held callback spelling mutation confirmed

A second current-mainline recheck now confirms the cross-file SCO request-time mutation witness, not just the direct `obfuscateFiles` property pass.

- Parent: main `a4c838b9cfa6a89f910b18deb4732692701f8809`
- Test-only branch: `agent24/mainline-external-host-caller-recheck-20261124`
- Test commit: `3c32802105d29ea14474bca93e6b5a1189b9b8a3`
- Exact parent-to-test diff: two added tests only; zero production changes.
- Focused two-OS run: [45433387887](https://github.com/FlareZ123/obfs/actions/runs/45433387887), Node 22.23.4. Both platforms passed the three behavioral-witness tests and strict JSDoc steps.

The tests use the actual `createScoHandler(files,{closedWorld:true})`, fetch entry/helper response bodies, then execute them under a host preload that replaces `queueMicrotask` with a sink reading `Function.prototype.toString.call(callback)` but never invoking the callback.

Results:
1. Host observer only in preload: callback source spelling changes in the delivered helper, while application stdout remains equal and callback invocation remains false.
2. Two concurrent helper GETs: each response gets an independent spelling variant; both differ from native and each other while preserving stdout.
3. Explicit source observer in entry: the existing heuristic preserves callback source but applies a group-wide zero-yield veto, also withholding an unrelated helper literal.

This is not a full SourceObservationPlan or browser result. It confirms that the current `interfileSourceObserver` heuristic misses host-held callback escapes when the observer is outside the input graph, and that request-time `varyLiteralSpellings` mutates the source before later `obfuscateFiles` passes. Any future plan must govern this stage too, be per-response/immutable for concurrent GETs, and preserve the callback closure while retaining unrelated safe yield.

Report: `im-results/agent24-mainline-sco-host-held-source-witness-2026-11-24.md` (main commit `560415b52f9d253c4da1110535320d01743763a9`). The original detailed witness is `im-results/agent24-sco-crossfile-host-held-spelling-2026-11-24.md`.

This is a focused current-mainline behavioral reproduction, not acceptance. Keep SCO RELEASE-BLOCKED for this shape until request-time variation is covered by a tested full-graph host-held-callable plan.
